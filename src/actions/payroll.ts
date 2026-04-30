"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFullAccess, isFullAccess, STAFF_ROLES } from "@/lib/roles";
import { notifySlack } from "@/lib/slack";
import { revalidatePath } from "next/cache";
import { calculatePayrollFromTags } from "@/lib/payroll";
import type { WorkTagType } from "@/generated/prisma";

// ──────────────────────────────────────────────────────────────────
// 직원: 출퇴근 태깅 (현재 시각 고정, 수정 불가)
// ──────────────────────────────────────────────────────────────────

export async function clockIn(note?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  // 직전 태그가 CLOCK_IN 이고 OUT 없으면 중복 방지
  const last = await prisma.workTag.findFirst({
    where: { userId: session.user.id },
    orderBy: { taggedAt: "desc" },
  });
  if (last?.type === "CLOCK_IN") {
    throw new Error("이미 출근 상태입니다. 퇴근 먼저 태깅하세요.");
  }

  const tag = await prisma.workTag.create({
    data: {
      userId: session.user.id,
      type: "CLOCK_IN",
      taggedAt: new Date(),
      note: note?.trim() || null,
    },
  });
  revalidatePath("/");
  revalidatePath("/payroll/me");
  revalidatePath("/payroll");
  return tag;
}

export async function clockOut(note?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const last = await prisma.workTag.findFirst({
    where: { userId: session.user.id },
    orderBy: { taggedAt: "desc" },
  });
  if (!last || last.type !== "CLOCK_IN") {
    throw new Error("출근 태깅이 없습니다. 출근 먼저 태깅하세요.");
  }

  const tag = await prisma.workTag.create({
    data: {
      userId: session.user.id,
      type: "CLOCK_OUT",
      taggedAt: new Date(),
      note: note?.trim() || null,
    },
  });
  revalidatePath("/");
  revalidatePath("/payroll/me");
  revalidatePath("/payroll");
  return tag;
}

/**
 * 현재 사용자 로그인 상태 조회.
 */
export async function getMyClockStatus() {
  const session = await auth();
  if (!session?.user) return null;
  const last = await prisma.workTag.findFirst({
    where: { userId: session.user.id },
    orderBy: { taggedAt: "desc" },
  });
  return {
    lastTag: last,
    isWorking: last?.type === "CLOCK_IN",
  };
}

// ──────────────────────────────────────────────────────────────────
// 관리자: 태그 수동 생성/수정/삭제
// ──────────────────────────────────────────────────────────────────

export async function adminCreateWorkTag(data: {
  userId: string;
  type: WorkTagType;
  taggedAt: string; // ISO
  note?: string;
}) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  return prisma.workTag.create({
    data: {
      userId: data.userId,
      type: data.type,
      taggedAt: new Date(data.taggedAt),
      note: data.note?.trim() || null,
      editedById: session!.user!.id,
      editedByName: session!.user!.name ?? "",
      editedAt: new Date(),
    },
  });
}

export async function adminUpdateWorkTag(
  id: string,
  data: { type?: WorkTagType; taggedAt?: string; note?: string }
) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  await prisma.workTag.update({
    where: { id },
    data: {
      type: data.type,
      taggedAt: data.taggedAt ? new Date(data.taggedAt) : undefined,
      note: data.note?.trim() || null,
      editedById: session!.user!.id,
      editedByName: session!.user!.name ?? "",
      editedAt: new Date(),
    },
  });
  revalidatePath("/payroll");
}

export async function adminDeleteWorkTag(id: string) {
  const session = await auth();
  requireFullAccess(session?.user?.role);
  await prisma.workTag.delete({ where: { id } });
  revalidatePath("/payroll");
}

// ──────────────────────────────────────────────────────────────────
// 관리자: PayrollSetting (시급)
// ──────────────────────────────────────────────────────────────────

export async function setPayrollSetting(userId: string, data: {
  hourlyRate: number;
  weeklyHolidayPay: boolean;
  note?: string;
}) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  if (!Number.isFinite(data.hourlyRate) || data.hourlyRate < 0) {
    throw new Error("시급은 0 이상이어야 합니다");
  }

  await prisma.payrollSetting.upsert({
    where: { userId },
    update: {
      hourlyRate: Math.round(data.hourlyRate),
      weeklyHolidayPay: data.weeklyHolidayPay,
      note: data.note?.trim() || null,
      updatedById: session!.user!.id,
    },
    create: {
      userId,
      hourlyRate: Math.round(data.hourlyRate),
      weeklyHolidayPay: data.weeklyHolidayPay,
      note: data.note?.trim() || null,
      updatedById: session!.user!.id,
    },
  });
  revalidatePath("/payroll");
}

// ──────────────────────────────────────────────────────────────────
// 월간 급여 계산 + 저장 (관리자)
// ──────────────────────────────────────────────────────────────────

export async function calculateMonthlyPayroll(userId: string, year: number, month: number) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const setting = await prisma.payrollSetting.findUnique({ where: { userId } });
  if (!setting) throw new Error("시급 설정이 없습니다. 관리자에서 먼저 시급을 설정하세요.");

  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, month, 1, 0, 0, 0, 0);

  const tags = await prisma.workTag.findMany({
    where: { userId, taggedAt: { gte: from, lt: to } },
    orderBy: { taggedAt: "asc" },
  });

  const result = calculatePayrollFromTags(tags, setting.hourlyRate, setting.weeklyHolidayPay);

  await prisma.payrollRecord.upsert({
    where: { userId_year_month: { userId, year, month } },
    update: {
      workMinutes: result.totalMinutes,
      baseWage: result.baseWage,
      weeklyHolidayWage: result.weeklyHolidayWage,
      totalWage: result.totalWage,
      hourlyRateAtCalc: setting.hourlyRate,
      calculatedAt: new Date(),
    },
    create: {
      userId,
      year,
      month,
      workMinutes: result.totalMinutes,
      baseWage: result.baseWage,
      weeklyHolidayWage: result.weeklyHolidayWage,
      totalWage: result.totalWage,
      hourlyRateAtCalc: setting.hourlyRate,
    },
  });

  revalidatePath("/payroll");
  return { ...result, missing: result.missing.length };
}

// ──────────────────────────────────────────────────────────────────
// OUT 누락 알림 (관리자 수동 트리거 or 미래 크론)
// ──────────────────────────────────────────────────────────────────

export async function notifyMissingClockOuts() {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  // 지난 24시간 내 사용자별 마지막 태그가 IN 인 경우를 찾는다 (= OUT 누락 가능)
  const since = new Date();
  since.setHours(since.getHours() - 24);

  const users = await prisma.user.findMany({
    where: { workTags: { some: { taggedAt: { gte: since } } } },
    select: { id: true, name: true },
  });

  const missing: { userId: string; userName: string; lastInAt: Date }[] = [];
  for (const u of users) {
    const last = await prisma.workTag.findFirst({
      where: { userId: u.id },
      orderBy: { taggedAt: "desc" },
    });
    if (last?.type === "CLOCK_IN") {
      missing.push({ userId: u.id, userName: u.name, lastInAt: last.taggedAt });
    }
  }

  if (missing.length > 0) {
    const lines = missing.map(
      (m) => `• ${m.userName} — 출근: ${m.lastInAt.toLocaleString("ko-KR")}`
    );
    await notifySlack(
      `⚠️ 퇴근 태그 누락 ${missing.length}건\n${lines.join("\n")}`
    );
  }

  return missing;
}

// ──────────────────────────────────────────────────────────────────
// 데이터 조회 헬퍼
// ──────────────────────────────────────────────────────────────────

export async function getMyPayrollSummary(months = 3) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const [tags, records] = await Promise.all([
    prisma.workTag.findMany({
      where: { userId: session.user.id, taggedAt: { gte: from } },
      orderBy: { taggedAt: "desc" },
      take: 500,
    }),
    prisma.payrollRecord.findMany({
      where: { userId: session.user.id },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: months,
    }),
  ]);

  return { tags, records };
}

export async function getAllPayrollData(year: number, month: number) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  // PayrollSetting 이 설정된 직원만 payroll 대상. 미설정 직원은 추가 버튼으로 편입.
  const staff = await prisma.user.findMany({
    where: {
      role: { in: [...STAFF_ROLES] },
      payrollSetting: { isNot: null },
    },
    select: {
      id: true,
      name: true,
      role: true,
      payrollSetting: true,
      payrollRecords: { where: { year, month }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 1);

  const tags = await prisma.workTag.findMany({
    where: { taggedAt: { gte: from, lt: to } },
    orderBy: { taggedAt: "asc" },
  });

  return { staff, tags };
}

/**
 * Payroll 대상 후보 (아직 PayrollSetting 없는 staff — 추가 버튼용).
 */
export async function getPayrollCandidates() {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  return prisma.user.findMany({
    where: {
      role: { in: [...STAFF_ROLES] },
      payrollSetting: { is: null },
    },
    select: { id: true, name: true, role: true, email: true },
    orderBy: { name: "asc" },
  });
}

export async function canSeeAllPayroll() {
  const session = await auth();
  return isFullAccess(session?.user?.role);
}
