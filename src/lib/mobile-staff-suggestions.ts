// 모바일 직원 건의사항 관리 — 목록 + 상태 변경·답변.
// 처리 로직은 src/lib/suggestion-handling.ts (웹 서버 액션과 공용).
// 숨김·삭제는 웹에서 원장(fullAccess)만 — 모바일은 제공하지 않는다.

import { z } from "zod";

import type { SuggestionStatus } from "@/generated/prisma/enums";
import { MobileApiError } from "@/lib/mobile-auth";
import { sendMobilePush } from "@/lib/mobile-push";
import { prisma } from "@/lib/prisma";
import {
  replyToStudentSuggestion,
  SUGGESTION_REPLY_MAX_LEN,
  SUGGESTION_STATUSES,
  updateSuggestionStatus,
  type SuggestionHandler,
} from "@/lib/suggestion-handling";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/suggestions";

const suggestionInclude = {
  student: { select: { id: true, name: true, grade: true } },
} as const;

type SuggestionRow = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.studentSuggestion.findFirst<{ include: typeof suggestionInclude }>
    >
  >
>;

function toItem(r: SuggestionRow) {
  return {
    id: r.id,
    category: r.category,
    categoryLabel: CATEGORY_LABELS[r.category],
    title: r.title,
    content: r.content,
    status: r.status,
    statusLabel: STATUS_LABELS[r.status],
    staffReply: r.staffReply,
    handledByName: r.handledByName || null,
    handledAt: r.handledAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    student: r.student,
  };
}

/**
 * 직원용 건의 목록 — 삭제·숨김(원장 처리)·퇴원생 건의 제외 (사이드바 배지와 같은 기준).
 * 최신순. summary 는 상태별 건수.
 */
export async function getMobileStaffSuggestions() {
  const rows = await prisma.studentSuggestion.findMany({
    where: { deletedAt: null, hiddenAt: null, student: { status: "ACTIVE" } },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: suggestionInclude,
  });

  const summary = Object.fromEntries(
    SUGGESTION_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]),
  ) as Record<SuggestionStatus, number>;

  return { items: rows.map(toItem), summary };
}

const updateSchema = z
  .object({
    status: z.enum(["RECEIVED", "REVIEWING", "REFLECTED", "DECLINED"]).optional(),
    reply: z
      .string()
      .trim()
      .max(SUGGESTION_REPLY_MAX_LEN, `답변은 ${SUGGESTION_REPLY_MAX_LEN}자 이하로 작성해 주세요`)
      .optional(),
  })
  .refine((v) => !!v.status || !!v.reply, { message: "바꿀 상태나 답변을 입력해 주세요" });

/**
 * 상태·답변 저장. 답변이 있으면 답변(+상태) 저장, 없으면 상태만 변경.
 * 반환: 갱신된 항목 + 학생 푸시(라우트가 after() 로 발송).
 */
export async function updateMobileStaffSuggestion(
  handler: SuggestionHandler,
  id: string,
  input: unknown,
) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    throw new MobileApiError(parsed.error.issues[0]?.message ?? "입력값을 확인하세요", 400);
  }
  const { status, reply } = parsed.data;

  const current = await prisma.studentSuggestion.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, staffReply: true },
  });
  if (!current) throw new MobileApiError("건의사항을 찾을 수 없습니다", 404);

  const replyChanged = !!reply && reply !== (current.staffReply ?? "").trim();
  if (reply) {
    await replyToStudentSuggestion(id, reply, status, handler);
  } else if (status) {
    await updateSuggestionStatus(id, status, handler);
  }

  const updated = await prisma.studentSuggestion.findUniqueOrThrow({
    where: { id },
    include: suggestionInclude,
  });

  return {
    item: toItem(updated),
    push: {
      studentId: updated.studentId,
      title: replyChanged ? "건의사항 답변 도착" : "건의사항 처리 상태 변경",
      body: replyChanged
        ? `“${updated.title}” 건의에 답변이 달렸어요.`
        : `“${updated.title}” 건의가 ‘${STATUS_LABELS[updated.status]}’ 상태가 됐어요.`,
    },
  };
}

/** 건의 처리 결과를 학생 앱에 푸시 — 실패해도 저장 결과에는 영향 없음 */
export async function sendSuggestionPush(push: { studentId: string; title: string; body: string }) {
  try {
    const authUser = await prisma.authUser.findUnique({
      where: { studentId: push.studentId },
      select: { id: true },
    });
    if (!authUser) return;
    await sendMobilePush({
      authUserIds: [authUser.id],
      body: push.body,
      category: "SYSTEM",
      data: { type: "suggestion" },
      title: push.title,
    });
  } catch (error) {
    console.error("[suggestion push]", error);
  }
}
