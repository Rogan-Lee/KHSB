// 학생 건의사항 처리(상태 변경·답변) 핵심 로직 — 웹 서버 액션(src/actions/student-suggestions.ts)과
// 모바일 직원 API(src/lib/mobile-staff-suggestions.ts)가 같이 쓴다.
// 호출 측이 직원 권한을 먼저 검증하고, revalidatePath 도 호출 측 책임.

import type { SuggestionStatus } from "@/generated/prisma/enums";
import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export const SUGGESTION_REPLY_MAX_LEN = 2000;
export const SUGGESTION_STATUSES: SuggestionStatus[] = [
  "RECEIVED",
  "REVIEWING",
  "REFLECTED",
  "DECLINED",
];

/** 처리한 직원 (이름은 스냅샷으로 저장) */
export type SuggestionHandler = { id: string; name: string | null };

/** 상태 변경 (전 직원) — 학생 미확인 배지 기준(statusUpdatedAt) 갱신. */
export async function updateSuggestionStatus(
  id: string,
  status: SuggestionStatus,
  handler: SuggestionHandler,
) {
  if (!SUGGESTION_STATUSES.includes(status)) {
    throw new MobileApiError("상태값이 올바르지 않습니다", 400);
  }
  const now = new Date();
  await prisma.studentSuggestion.update({
    where: { id },
    data: {
      status,
      handledById: handler.id,
      handledByName: handler.name ?? "",
      handledAt: now,
      statusUpdatedAt: now,
    },
  });
}

/** 답변 작성 (+선택적 상태 변경). 전 직원. */
export async function replyToStudentSuggestion(
  id: string,
  replyInput: string,
  status: SuggestionStatus | undefined,
  handler: SuggestionHandler,
) {
  const reply = replyInput.trim();
  if (!reply) throw new MobileApiError("답변 내용을 입력해 주세요", 400);
  if (reply.length > SUGGESTION_REPLY_MAX_LEN) {
    throw new MobileApiError(`답변은 ${SUGGESTION_REPLY_MAX_LEN}자 이하로 작성해 주세요`, 400);
  }
  if (status && !SUGGESTION_STATUSES.includes(status)) {
    throw new MobileApiError("상태값이 올바르지 않습니다", 400);
  }

  const now = new Date();
  await prisma.studentSuggestion.update({
    where: { id },
    data: {
      staffReply: reply,
      ...(status ? { status } : {}),
      handledById: handler.id,
      handledByName: handler.name ?? "",
      handledAt: now,
      statusUpdatedAt: now,
    },
  });
}
