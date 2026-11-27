// 생성형 AI 고지·표시 (인공지능기본법 제31조). 외부 AI 호출은 모두 src/lib/groq.ts 의 groqChat 을 거친다.
// 화면 컴포넌트는 src/components/ai/ai-disclosure.tsx. 모바일 앱(apps/mobile)은 같은 문구를 따로 들고 있다.

/** 사전 고지 — 끝 문장(결과가 어디로 가는지)만 기능마다 다르다 */
export function aiNoticeText(tail: string): string {
  return `AI(Groq)로 초안을 만들어요. 이름은 가명으로 바꾸고 연락처는 빼고 보내요. ${tail}`;
}

/** 학부모·학생 화면의 결과물 표시 */
export const AI_REVIEWED_LABEL = "AI가 초안을 만들고 운영진이 확인했어요";
/** 학생 화면 — 학부모 요청에서 나온 지시라는 걸 드러내지 않는다 */
export const AI_REVIEWED_LABEL_STUDENT = "AI가 초안을 만들고 선생님이 확인했어요";

/**
 * 저장할 글의 AI 출처 칸(customNoteAi·mentoringSummaryAi) 값. AI 초안에서 시작한 글이면 true(고쳐 저장해도),
 * 운영진이 직접 쓴 글이나 빈 글이면 false.
 */
export function aiSourceFlag(text: string | null | undefined, fromAi: boolean | undefined): boolean {
  return fromAi === true && !!text?.trim();
}

/**
 * 온라인 보고서 본문이 AI 로 만든 것인지. AI 생성 경로(바로 생성·예약 생성)만 content.generatedAt 을 남기고,
 * 원장 편집 저장(updateReportContent)은 그 값을 그대로 둔다.
 */
export function isAiOnlineReport(content: unknown): boolean {
  if (!content || typeof content !== "object") return false;
  return typeof (content as { generatedAt?: unknown }).generatedAt === "string";
}
