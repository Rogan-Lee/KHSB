import type { NextRequest } from "next/server";
import { z } from "zod";

import { MobileApiError, requireMobileParent } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";

// 학부모 앱 — 신청·소통 영역(도시락·등원 스케줄·모의고사·문의·공지) 공용 헬퍼 + 전체 탭 요약.
// 자녀 단위 요청은 전부 ParentLink 로 검증한다 (학생 매직링크 토큰은 쓰지 않는다).

export type ParentChildRef = { id: string; name: string; grade: string; seat: string | null };

export function parseMobileBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new MobileApiError(result.error.issues[0]?.message ?? "입력값을 확인하세요", 400);
}

/** 세션 학부모 + 요청 자녀(연결된 자녀인지 강제 검증). studentId 가 없거나 남의 자녀면 403. */
export async function requireParentAndChild(request: NextRequest, studentId: unknown) {
  const parent = await requireMobileParent(request);
  const child = parent.children.find((c) => c.id === studentId);
  if (!child) throw new MobileApiError("자녀 정보에 접근할 수 없습니다", 403);
  return { parent, child: child as ParentChildRef };
}

/** JSON 본문을 읽고 본문의 studentId 로 자녀를 검증 */
export async function requireParentChildFromBody(request: NextRequest) {
  const body = (await request.json().catch(() => {
    throw new MobileApiError("요청 형식을 확인하세요", 400);
  })) as unknown;
  const studentId =
    body && typeof body === "object" ? (body as { studentId?: unknown }).studentId : undefined;
  const ctx = await requireParentAndChild(request, studentId);
  return { ...ctx, body };
}

/** 쿼리스트링 studentId 로 자녀를 검증 */
export function requireParentChildFromQuery(request: NextRequest) {
  return requireParentAndChild(request, request.nextUrl.searchParams.get("studentId"));
}

// ─── 전체 탭 요약 ─────────────────────────────────────────────────────

export type ParentLunchSummary = "closed" | "open" | "unpaid" | "claimed" | "confirmed";

export async function getParentServicesSummary(authUserId: string, child: ParentChildRef) {
  const today = todayKST();
  const now = new Date();

  const [menuCount, pendingOrder, confirmedUpcoming, proposal, openExamCount, myApplications, openInquiries] =
    await Promise.all([
      prisma.lunchMenu.count({ where: { date: { gte: today }, closed: false } }),
      prisma.lunchOrder.findFirst({
        where: { studentId: child.id, paidStatus: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: { depositClaimedAt: true },
      }),
      prisma.lunchOrderItem.count({
        where: { order: { studentId: child.id, paidStatus: "PAID" }, menu: { date: { gte: today } } },
      }),
      prisma.scheduleProposal.findFirst({
        where: {
          studentId: child.id,
          status: "PROPOSED",
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { id: true },
      }),
      prisma.examSession.count({ where: { applicationOpen: true, examDate: { gte: today } } }),
      prisma.examApplication.count({
        where: {
          studentId: child.id,
          status: { in: ["PENDING", "CONFIRMED"] },
          session: { examDate: { gte: today } },
        },
      }),
      prisma.communication.count({
        where: {
          studentId: child.id,
          type: "PARENT_REQUEST",
          createdById: authUserId,
          isChecked: false,
        },
      }),
    ]);

  const lunch: ParentLunchSummary = pendingOrder
    ? pendingOrder.depositClaimedAt
      ? "claimed"
      : "unpaid"
    : confirmedUpcoming > 0
      ? "confirmed"
      : menuCount > 0
        ? "open"
        : "closed";

  return {
    lunch,
    schedule: { pendingProposal: !!proposal },
    exams: { openCount: openExamCount, appliedCount: myApplications },
    inquiries: { waitingCount: openInquiries },
  };
}
