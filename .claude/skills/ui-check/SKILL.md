---
name: ui-check
description: UI 를 고친 뒤 모바일 기본 UX(키보드·뷰포트·폼·상태)를 SEED 우선으로 점검하고 .claude/state/ui-check.json 에 기록한다. 기록이 없으면 Stop 훅이 종료를 막는다. 트리거 - tsx·css·landing html 수정 후, input, textarea, form, 폼, 입력칸, 키보드, keyboard, modal, 모달, dialog, 바텀시트, bottom sheet, fixed, sticky, 하단 고정 버튼, CTA, 100vh, dvh, viewport, safe-area, 레이아웃, 반응형, 모바일, 터치 영역, hover, 빈 화면, 로딩, 에러 상태, 중복 제출, "UI 점검", "ui-check".
---

# ui-check

UI 파일(`src/app`·`src/components` 의 tsx, `src` 의 css, `landing/*.html|css`)을 고쳤으면 "완료"라고 하기 전에 이 절차를 끝까지 돌린다. `.claude/state/ui-check.json` 이 마지막 UI 변경보다 오래되면 Stop 훅(`.claude/hooks/ui-stop-gate.sh`)이 종료를 막는다.

## SEED 먼저

1. 우선순위: SEED 컴포넌트·토큰 > 이 체크리스트(`.claude/rules/mobile-ui.md`) > 범용 스킬.
2. 범용 스킬(web-design-guidelines, mobile-ux-optimizer)은 빠진 UX(상태·접근성·키보드·폼 속성)를 찾는 데만 쓴다. 그 스킬 예시에 나오는 색·간격·타이포·radius·커스텀 유틸(`pb-safe`, `bg-leather-*` 같은 것)은 가져오지 않는다. 값은 SEED 토큰(`p-x4`, `t5-medium`, `rounded-r4`, `bg-bg-layer-default` …)만 쓴다. SEED 치수 유틸이 없는 속성(inset·top·translate·min/max-w)만 Tailwind 기본값을 쓴다.
3. 새 UI 요소를 만들기 전에 SEED 에 있는지 본다: `src/seed-design/ui/`, seed-docs MCP `list_react_components` → `get_react_component`. 있으면 그걸 쓰고, 프로젝트에 없으면 `seed-design` 스킬로 CLI 추가한다.
4. SEED 컴포넌트 내부 스타일은 커스텀 CSS 로 덮지 않는다. 체크리스트와 어긋나 보이면(예: 버튼 높이 40px) 고치지 말고 기록의 `violations` 에 `status: "seed-report"` 로 남기고 보고한다.
5. 키보드·뷰포트: 앱 레벨(viewport meta, dvh, visualViewport, 하단 고정 CTA)은 우리가 처리하고, 컴포넌트 레벨(BottomSheet·TextField·Dialog)은 seed-docs MCP `get_docs_component`·`get_react_component` 로 지원 여부부터 확인한다. [references/keyboard.md](references/keyboard.md)
6. `src/seed-design/`(SEED CLI 스니펫)과 `apps/`(Expo 앱)은 대상이 아니다. `landing/` 은 SEED 대신 `bx-core.css` 토큰이 기준이다.

## 절차

### 1) 대상 파일

```sh
.claude/hooks/ui-stop-gate.sh --list   # 커밋 안 된 UI 파일
```

여기에 이번 세션에서 고치고 이미 커밋한 UI 파일을 더한다. 컴포넌트를 고쳤으면 그걸 쓰는 페이지(`grep -rln "<컴포넌트명>" src/app`)도 스크린샷 대상에 넣는다.

### 2) 체크리스트 대조 → 위반 보고 → 수정

각 파일을 `.claude/rules/mobile-ui.md` 의 12개 항목과 대조한다. 주제별 기준은 references 에 있다.

- 키보드·뷰포트·하단 CTA·safe-area: [references/keyboard.md](references/keyboard.md)
- 입력칸 속성·글자 크기·라벨·제출: [references/forms.md](references/forms.md)
- 빈·로딩·에러 상태, 중복 제출: [references/states.md](references/states.md)

후보를 빠르게 찾는 grep(판단은 코드를 읽고 한다):

```sh
L=$(.claude/hooks/ui-stop-gate.sh --list)
echo "$L" | xargs grep -nE '100vh|h-screen|min-h-screen'            # 1
echo "$L" | xargs grep -nE '<input|<textarea|TextFieldInput|TextFieldTextarea'  # 4·7
echo "$L" | xargs grep -nE '\bfixed\b|sticky|position: ?fixed'      # 6·8
echo "$L" | xargs grep -nE 'overflow: ?hidden|overflow-hidden' | grep -i html  # 9
echo "$L" | grep -E '\.(css|html)$' | xargs grep -n ':hover'         # 10
```

위반은 `file:line — 규칙 번호 — 무엇이 문제 — 조치(고침 / 보고만)` 형식으로 먼저 보고하고 고친다. 이번에 건드린 코드 범위의 위반만 고치고, 원래 있던 범위 밖 위반은 보고만 한다.

### 3) 393×852 모바일 스크린샷

- dev 서버: 메인 폴더에서 `npm run dev`(개발 DB = `.env.development.local`, 로컬 Docker). 워크트리의 `.env.local` 은 운영 DB 이므로 그대로 띄우지 않는다. 이미 떠 있으면 재사용한다.
- Playwright MCP: `browser_resize`(width 393, height 852) → `browser_navigate` → `browser_take_screenshot`(파일은 `.claude/state/screens/` 에). 입력칸이 있으면 탭한 상태도 한 장.
- 가로 넘침 검사: `browser_evaluate` 로 `document.documentElement.scrollWidth > window.innerWidth` 가 `false` 인지 본다(가로 넘침은 안드로이드에서 sticky·fixed 를 사라지게 한다).
- 찍은 이미지를 Read 로 직접 보고 잘림·겹침·고정 요소가 본문을 가리는지 확인한다.
- Playwright MCP 가 없으면 gstack `/browse` 로 같은 크기 스크린샷을 찍는다.
- 로그인·토큰·데이터가 없어 화면을 못 열면 억지로 하지 않고 이유를 `skipped` 에 적는다. 운영 계정·운영 DB 로 로그인하지 않는다.
- 데스크톱 크로미움에는 가상 키보드가 없다. 여기서 통과해도 키보드 동작은 검증된 게 아니다.

### 4) 보고

두 부분으로 나눠 보고한다.

- **코드로 검증한 항목**: 규칙별 통과/고침, file:line 근거, 스크린샷 경로.
- **실기기 확인 필요 항목**: iOS Safari·Android Chrome 에서 무엇을 눌러 무엇을 보면 되는지(키보드가 입력칸·CTA 를 가리는지, 닫은 뒤 위치 복귀, 자동완성 바, 노치·홈 인디케이터). [references/keyboard.md](references/keyboard.md) 끝의 목록 참고.
- SEED 쪽 문제로 보고만 한 항목은 따로 적는다.

### 5) 기록 (항상 마지막)

모든 수정이 끝난 뒤 쓴다. 기록 뒤에 UI 를 또 고치면 다시 돌려야 한다. `.claude/` 는 Write 도구로 쓰면 권한 확인에 막히므로 반드시 스크립트로 쓴다(`checkedAt` 은 스크립트가 넣는다).

```sh
.claude/hooks/ui-stop-gate.sh --record <<'EOF'
{
  "files": ["src/app/apply/page.tsx"],
  "result": "pass",
  "violations": [
    { "file": "src/app/apply/page.tsx", "line": 33, "rule": 1, "status": "fixed" }
  ],
  "screenshots": [".claude/state/screens/apply-393x852.png"],
  "skipped": [],
  "needsDevice": ["iOS: 연락처 칸 탭 → 하단 제출 버튼이 키보드에 가리는지"]
}
EOF
```

- `result`: 남은 위반(`status: "open"`)이 없으면 `"pass"`, 있으면 `"fail"`. 실패도 그대로 적고 보고에서 숨기지 않는다.
- `status`: `fixed`(고침) · `open`(못 고침) · `seed-report`(SEED 컴포넌트라 보고만).
