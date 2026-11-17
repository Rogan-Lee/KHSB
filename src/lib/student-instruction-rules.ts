// 학생 지시 문장 규칙 — 서버(src/lib/student-instructions.ts)와 웹 화면이 같이 쓴다 (DB·AI 의존 없음).
// 앱은 apps/mobile/src/lib/api/instructions.ts 에 같은 규칙을 둔다.

export const INSTRUCTION_MAX_LEN = 500;

const PARENT_WORDS = /부모|어머니|어머님|아버지|아버님|엄마|아빠|보호자/;

/** 학생에게 보낼 문장에 학부모를 떠올리게 하는 말이 있는지 — AI 초안은 버리고, 운영진 화면은 경고만 띄운다 */
export function mentionsParent(text: string) {
  return PARENT_WORDS.test(text);
}
