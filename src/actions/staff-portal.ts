"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { validateStaffMagicLink } from "@/lib/staff-auth";
import { hasGatePass } from "@/lib/token-auth";
import { notifySlack } from "@/lib/slack";
import type { WorkTagType, WorkTag } from "@/generated/prisma";

/**
 * 근무자 매직링크 포털용 공통 검증.
 * 토큰 + 게이트 쿠키 모두 통과해야 사용자/링크 컨텍스트 반환.
 */
async function ensurePortalAccess(token: string): Promise<{
  userId: string;
  userName: string;
}> {
  const session = await validateStaffMagicLink(token);
  if (!session) throw new Error("이 링크는 더 이상 유효하지 않습니다");

  const gated = await hasGatePass("STAFF", token, session.user.id);
  if (!gated) throw new Error("본인 확인이 필요합니다");

  return { userId: session.user.id, userName: session.user.name };
}

// ──────────────────────────────────────────────────────────────────
// 출퇴근 태깅 (매직링크 포털 — 토큰 + 본인 확인 기반)
// ──────────────────────────────────────────────────────────────────

/**
 * 매직링크 포털에서 출/퇴근 태그를 기록.
 * - 직전 태그와 같은 타입이면 거절(중복 방지).
 * - 슬랙으로 알림 (fire-and-forget).
 * - `/w/[token]` 페이지 revalidate.
 */
export async function submitClockEvent(
  token: string,
  type: WorkTagType,
  note?: string,
): Promise<WorkTag> {
  const { userId, userName } = await ensurePortalAccess(token);

  // 직전 태그 검사 — 이중 출근/퇴근 방지
  const last = await prisma.workTag.findFirst({
    where: { userId },
    orderBy: { taggedAt: "desc" },
  });
  if (type === "CLOCK_IN") {
    if (last?.type === "CLOCK_IN") {
      throw new Error("이미 출근 상태입니다. 퇴근 먼저 태깅하세요.");
    }
  } else {
    if (!last || last.type !== "CLOCK_IN") {
      throw new Error("출근 태깅이 없습니다. 출근 먼저 태깅하세요.");
    }
  }

  const tag = await prisma.workTag.create({
    data: {
      userId,
      type,
      taggedAt: new Date(),
      note: note?.trim() || null,
    },
  });

  const label = type === "CLOCK_IN" ? "출근" : "퇴근";
  notifySlack(`🕐 *${userName} ${label}* via 매직링크`).catch(() => {});

  // App Router dynamic route — page-level revalidate
  revalidatePath("/w/[token]", "page");

  return tag;
}

// ──────────────────────────────────────────────────────────────────
// 포털 요약 — 오늘 상태 + 이번달 + 최근 5건
// ──────────────────────────────────────────────────────────────────

export type StaffPortalSummary = {
  userName: string;
  lastTag: { id: string; type: WorkTagType; taggedAt: Date } | null;
  isWorking: boolean;
  monthMinutes: number;
  monthYear: number;
  monthMonth: number; // 1-12 (KST 기준)
  recentTags: { id: string; type: WorkTagType; taggedAt: Date; note: string | null }[];
};

/**
 * 이번달(KST 기준)의 페어링된 근무 시간(분).
 * - CLOCK_IN → CLOCK_OUT 짝만 합산.
 * - 출근만 있고 퇴근이 없는 미페어링 태그는 제외.
 */
function monthRangeKST(now: Date = new Date()): { start: Date; end: Date; year: number; month: number } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth(); // 0-indexed
  // KST 자정 = UTC -9시
  const start = new Date(Date.UTC(year, month, 1, -9, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, -9, 0, 0));
  return { start, end, year, month: month + 1 };
}

function pairMinutes(tagsAsc: { type: WorkTagType; taggedAt: Date }[]): number {
  let total = 0;
  let openIn: Date | null = null;
  for (const t of tagsAsc) {
    if (t.type === "CLOCK_IN") {
      // 이전 IN 이 짝이 없으면 폐기(보수적)
      openIn = t.taggedAt;
    } else if (t.type === "CLOCK_OUT" && openIn) {
      const diff = t.taggedAt.getTime() - openIn.getTime();
      if (diff > 0) total += Math.floor(diff / 60000);
      openIn = null;
    }
  }
  return total;
}

export async function getMyPortalSummary(token: string): Promise<StaffPortalSummary> {
  const { userId, userName } = await ensurePortalAccess(token);

  const { start, end, year, month } = monthRangeKST();

  const [lastTag, monthTags, recentTags] = await Promise.all([
    prisma.workTag.findFirst({
      where: { userId },
      orderBy: { taggedAt: "desc" },
      select: { id: true, type: true, taggedAt: true },
    }),
    prisma.workTag.findMany({
      where: { userId, taggedAt: { gte: start, lt: end } },
      orderBy: { taggedAt: "asc" },
      select: { type: true, taggedAt: true },
    }),
    prisma.workTag.findMany({
      where: { userId },
      orderBy: { taggedAt: "desc" },
      take: 5,
      select: { id: true, type: true, taggedAt: true, note: true },
    }),
  ]);

  return {
    userName,
    lastTag,
    isWorking: lastTag?.type === "CLOCK_IN",
    monthMinutes: pairMinutes(monthTags),
    monthYear: year,
    monthMonth: month,
    recentTags,
  };
}
