// 시설 이름 — 학부모 안내 문구("○○로 문의해 주세요")에 쓴다. 다른 시설에 붙일 때는 FACILITY_NAME 만 바꾼다.
export const FACILITY_NAME = process.env.FACILITY_NAME?.trim() || "강한선배";

/** "강한선배로" · "스터디룸으로" — 받침(ㄹ 제외) 있으면 "으로". 한글이 아니면 "(으)로" */
export function withRo(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}(으)로`;
  const jong = code % 28;
  return `${word}${jong === 0 || jong === 8 ? "로" : "으로"}`;
}

/** 학부모 안내 끝맺음 — "강한선배로 문의해 주세요." */
export const ASK_FACILITY = `${withRo(FACILITY_NAME)} 문의해 주세요.`;
