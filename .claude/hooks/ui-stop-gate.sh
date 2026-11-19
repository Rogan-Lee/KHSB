#!/usr/bin/env bash
# Stop gate: if UI files changed in this session, require a fresh .claude/state/ui-check.json.
#   stdin (Stop hook JSON) → exit 0 = allow stop, exit 2 + stderr = keep working.
#   --list → print uncommitted UI files (used by the ui-check skill).
#   --record < result.json → write the ui-check record (adds checkedAt).
# UI file patterns mirror .claude/rules/mobile-ui.md `paths`; keep both in sync.
set -u

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
state="$root/.claude/state/ui-check.json"
ui_re='(^|/)(src/(app|components)/.+\.tsx|src/.+\.css|landing/[^/]+\.(html|css))$'
skip_re='(^|/)(src/seed-design|apps|node_modules)/' # SEED CLI snippets, Expo app

dirty_ui() {
  { git -C "$root" diff --name-only HEAD; git -C "$root" ls-files -o --exclude-standard; } 2>/dev/null |
    grep -E "$ui_re" | grep -Ev "$skip_re" | sort -u
}

if [ "${1:-}" = "--list" ]; then dirty_ui; exit 0; fi

# The Write tool can't touch .claude/ without a prompt, so the skill records through here (JSON on stdin).
if [ "${1:-}" = "--record" ]; then
  mkdir -p "$(dirname "$state")"
  jq -e --arg t "$(date +%Y-%m-%dT%H:%M:%S%z)" \
    'if (.result == "pass" or .result == "fail") and (.files | type == "array") then {checkedAt: $t} + . else error("result(pass|fail) 와 files 배열이 필요합니다") end' \
    > "$state.tmp" && mv "$state.tmp" "$state" && echo "기록함: ${state#"$root"/}"
  exit
fi

input=$(cat)
[ "$(jq -r '.stop_hook_active // false' <<<"$input")" = "true" ] && exit 0

transcript=$(jq -r '.transcript_path // empty' <<<"$input")
session_start=0
[ -f "$transcript" ] && session_start=$(stat -f %B "$transcript")

# Candidates: files written via Edit/Write/MultiEdit this session (even if already committed)
# + uncommitted UI files (catches sed/Bash edits). Only files modified after session start count.
latest=0
changed=()
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in /*) ;; *) f="$root/$f" ;; esac
  [ -f "$f" ] || continue
  m=$(stat -f %m "$f")
  [ "$m" -gt "$session_start" ] || continue
  changed+=("${f#"$root"/}")
  [ "$m" -gt "$latest" ] && latest=$m
done < <(
  {
    [ -f "$transcript" ] &&
      grep -E '"name":"(Edit|Write|MultiEdit)"' "$transcript" |
      jq -r '.message.content[]? | select(.type=="tool_use" and (.name=="Edit" or .name=="Write" or .name=="MultiEdit")) | .input.file_path // empty' 2>/dev/null |
      grep -E "$ui_re" | grep -Ev "$skip_re"
    dirty_ui
  } | sed "s|^$root/||" | sort -u
)

[ "${#changed[@]}" -eq 0 ] && exit 0
[ -f "$state" ] && [ "$(stat -f %m "$state")" -ge "$latest" ] && exit 0

{
  echo "이번 세션에서 UI 파일이 바뀌었는데 ui-check 기록이 없거나 그보다 오래됐습니다:"
  printf '  - %s\n' "${changed[@]:0:15}"
  echo "ui-check 스킬을 실행하고 결과를 .claude/state/ui-check.json 에 기록하세요. 기록 전에는 완료가 아닙니다."
} >&2
exit 2
