import { revalidatePath } from "next/cache";

import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";

// 온라인 학습 리포트 — 학부모 피드백 저장 핵심 로직 (리포트 ID 기준).
// 접근 검증은 호출 측 책임: 웹 공개 페이지(src/actions/online/parent-reports.ts, 토큰)와
// 학부모 앱(src/lib/mobile-parent-inquiries.ts, ParentLink)이 같이 쓴다.

export function validateParentFeedbackContent(content: string) {
  if (!content.trim()) throw new MobileApiError("내용을 입력해 주세요", 400);
  if (content.length > 2000) throw new MobileApiError("2000자 이내로 작성해 주세요", 400);
}

/** 발송된 리포트에 피드백 저장 + 원장 Slack 알림 */
export async function createOnlineParentFeedback(
  report: { id: string; studentName: string },
  params: { name?: string | null; content: string },
) {
  await prisma.onlineParentFeedback.create({
    data: {
      reportId: report.id,
      name: params.name?.trim() || null,
      content: params.content.trim(),
    },
  });

  const label = params.name?.trim() ? `"${params.name.trim()}" 님` : "학부모님";
  await notifySlack(
    `💬 *${report.studentName} 학부모 피드백 도착*\n${label}: ${params.content.slice(0, 200)}${params.content.length > 200 ? "..." : ""}\n_/online/reports/${report.id} 에서 확인_`,
  );

  revalidatePath(`/online/reports/${report.id}`);
  return { ok: true };
}
