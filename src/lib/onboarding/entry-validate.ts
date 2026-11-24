// 입실 준비 입력 검사 — 모바일 API 가 저장 전에 부른다 (순수 함수).
// 모르는 key 는 버리고, 문자열은 trim 해서 돌려준다.

import {
  GRADE_SUBJECTS,
  type EntryGrades,
  type EntryMentor,
  type MentorQuestion,
  type SubjectGrades,
} from "./entry";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

class Invalid extends Error {}
const fail = (message: string): never => {
  throw new Invalid(message);
};
function run<T>(fn: () => T): Parsed<T> {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}

/** 받침에 맞는 조사: josa("과목", "을", "를") → "과목을" */
const josa = (word: string, withFinal: string, withoutFinal: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code < 11172 && code % 28 !== 0 ? withFinal : withoutFinal);
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 필수 문자열: trim 후 1~max 자 */
function requiredText(v: unknown, max: number, label: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) fail(`${josa(label, "을", "를")} 입력해 주세요`);
  if (s.length > max) fail(`${josa(label, "은", "는")} ${max}자까지 입력할 수 있어요`);
  return s;
}

// ─── 성적 ─────────────────────────────────────────────────────────────

function parseScores(v: unknown): SubjectGrades {
  if (!isObj(v)) return fail("성적 형식이 올바르지 않아요");
  const out: SubjectGrades = {};
  for (const subject of GRADE_SUBJECTS) {
    const g = v[subject];
    if (g === undefined) continue;
    if (g !== null && !(Number.isInteger(g) && (g as number) >= 1 && (g as number) <= 9)) {
      fail("등급은 1~9 사이로 입력해 주세요");
    }
    out[subject] = g as number | null;
  }
  return out;
}

export function parseEntryGrades(body: unknown): Parsed<EntryGrades> {
  return run(() => {
    if (!isObj(body)) return fail("성적 형식이 올바르지 않아요");
    const { mock, school } = body;
    if (mock != null && !isObj(mock)) fail("모의고사 형식이 올바르지 않아요");
    if (school != null && !isObj(school)) fail("내신 형식이 올바르지 않아요");
    return {
      mock: isObj(mock)
        ? { examName: requiredText(mock.examName, 40, "모의고사 이름"), scores: parseScores(mock.scores) }
        : null,
      school: isObj(school)
        ? { term: requiredText(school.term, 40, "내신 시기"), scores: parseScores(school.scores) }
        : null,
    };
  });
}

// ─── 멘토 매칭 설문 ───────────────────────────────────────────────────

const MENTOR_TEXT_MAX = 500;

/** body = { answers } — 질문 목록에 있는 key 만 남긴다 */
export function parseEntryMentor(
  body: unknown,
  questions: MentorQuestion[],
): Parsed<{ answers: EntryMentor }> {
  return run(() => {
    if (!isObj(body) || !isObj(body.answers)) return fail("설문 형식이 올바르지 않아요");
    const raw = body.answers;
    const answers: EntryMentor = {};
    for (const q of questions) {
      const v = raw[q.key];
      const options = q.options ?? [];
      let answer: string | string[] = "";
      if (q.kind === "multi") {
        if (v != null && !Array.isArray(v)) fail("설문 형식이 올바르지 않아요");
        const picked = (v ?? []) as unknown[];
        if (picked.some((p) => !options.includes(p as string))) fail("보기에 없는 답이 있어요");
        answer = options.filter((o) => picked.includes(o));
      } else {
        if (v != null && typeof v !== "string") fail("설문 형식이 올바르지 않아요");
        answer = ((v as string | undefined) ?? "").trim();
        if (q.kind === "single" && answer && !options.includes(answer)) fail("보기에 없는 답이 있어요");
        if (q.kind === "text" && answer.length > MENTOR_TEXT_MAX) {
          fail(`답은 ${MENTOR_TEXT_MAX}자까지 입력할 수 있어요`);
        }
      }
      if (answer.length === 0) {
        if (q.required) fail(`"${q.title}"에 답해 주세요`);
        continue;
      }
      answers[q.key] = answer;
    }
    return { answers };
  });
}
