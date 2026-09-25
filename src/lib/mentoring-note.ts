// 멘토링 노트 섹션 — 원본 멘토링 필드(content/improvements/…)와
// AI 고도화 리포트(customNote 의 "[오늘 멘토링 내용]\n…" 형식)가 같은 구조를 공유한다.
// 형식을 만드는 쪽: src/lib/report-ai-prompts.ts, src/components/mentoring/parent-report-*.tsx

export const MENTORING_NOTE_SECTIONS = [
  { key: "content", label: "오늘 멘토링 내용" },
  { key: "improvements", label: "개선된 점" },
  { key: "weaknesses", label: "보완할 점" },
  { key: "nextGoals", label: "다음 멘토링 목표" },
  { key: "notes", label: "기타 메모" },
] as const;

export type MentoringNoteKey = (typeof MENTORING_NOTE_SECTIONS)[number]["key"];
export type MentoringNoteFields = Partial<Record<MentoringNoteKey, string | null>>;

const KEY_BY_LABEL = new Map<string, MentoringNoteKey>(
  MENTORING_NOTE_SECTIONS.map((s) => [s.label, s.key])
);

/**
 * "[오늘 멘토링 내용]\n본문\n\n[개선된 점]\n본문…" 을 섹션별로 나눈다.
 * 알려진 섹션 제목이 하나도 없으면 null (일반 안내문으로 취급).
 * 첫 섹션 앞의 글은 preamble 로 돌려준다.
 */
export function parseMentoringNote(
  text: string | null | undefined
): { fields: MentoringNoteFields; preamble: string } | null {
  if (!text) return null;
  const fields: MentoringNoteFields = {};
  const preamble: string[] = [];
  let current: MentoringNoteKey | null = null;
  let buf: string[] = [];
  let found = false;

  const flush = () => {
    const body = buf.join("\n").trim();
    if (current) {
      if (body) fields[current] = fields[current] ? `${fields[current]}\n\n${body}` : body;
    } else if (body) {
      preamble.push(body);
    }
    buf = [];
  };

  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const m = line.trim().match(/^\[(.+)\]$/);
    const key = m ? KEY_BY_LABEL.get(m[1].trim()) : undefined;
    if (key) {
      flush();
      current = key;
      found = true;
    } else {
      buf.push(line);
    }
  }
  flush();

  return found ? { fields, preamble: preamble.join("\n\n") } : null;
}
