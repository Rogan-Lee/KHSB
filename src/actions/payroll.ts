"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFullAccess, isFullAccess, STAFF_ROLES } from "@/lib/roles";
import { notifySlack } from "@/lib/slack";
import { revalidatePath } from "next/cache";
import { calculatePayrollFromTags, calculatePayrollFromEntries, type EntryPayrollResult } from "@/lib/payroll";
import type { WorkTagType, UserStatus } from "@/generated/prisma";

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
    // 퇴사자는 OUT 누락 알림 대상에서 제외 (picker 성격)
    where: { status: "ACTIVE", workTags: { some: { taggedAt: { gte: since } } } },
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
  // 주의: history 조회이므로 status 필터 미적용 — 퇴사자의 과거 payroll 도 노출되어야 함.
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
      // 신규 PayrollSetting 추가 버튼 picker — 퇴사자는 후보에서 제외
      status: "ACTIVE",
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

// ──────────────────────────────────────────────────────────────────
// 근무자 활성/퇴사 상태 변경 (Sprint 3-1 / 5.4 / 7 공통 진입점)
// 픽커 필터·매직링크 게이트의 단일 소스. 과거 데이터는 보존.
// ──────────────────────────────────────────────────────────────────

export async function setUserStatus(
  userId: string,
  status: UserStatus,
  terminationNote?: string,
) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  if (!userId) throw new Error("대상 사용자가 지정되지 않았습니다");
  if (session!.user!.id === userId) {
    throw new Error("본인 상태는 직접 변경할 수 없습니다");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, status: true },
  });
  if (!target) throw new Error("사용자를 찾을 수 없습니다");

  // STUDENT 역할에는 status 사용 안 함 (학생은 StudentStatus 사용)
  if (target.role === "STUDENT") {
    throw new Error("학생 계정은 학생 상태(StudentStatus)로 관리합니다");
  }

  const isTerminating = status === "TERMINATED";

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      status,
      terminatedAt: isTerminating ? new Date() : null,
      terminationNote: isTerminating ? (terminationNote?.trim() || null) : null,
    },
    select: { id: true, name: true, status: true, terminatedAt: true },
  });

  // 슬랙 알림 (fire-and-forget — 실패해도 비즈니스 로직 미차단)
  void notifySlack(
    isTerminating
      ? `🔚 *근무자 퇴사 처리*\n• ${target.name}\n• 처리자: ${session!.user!.name}\n${terminationNote ? `• 사유: ${terminationNote}` : ""}`
      : `🔁 *근무자 활성 복귀*\n• ${target.name}\n• 처리자: ${session!.user!.name}`,
  );

  revalidatePath("/payroll");
  revalidatePath("/admin");
  return updated;
}

// ──────────────────────────────────────────────────────────────────
// PayrollContract — 월별 활성 계약 (Sprint 3 PR 3.2)
// 시급 변경 시 새 행 추가 → 직전 계약의 effectiveTo 자동 종료.
// 모든 급여 산정의 단일 진입점은 getActiveContractFor(userId, ymd).
// ──────────────────────────────────────────────────────────────────

/**
 * KST 기준 "월 1일 00:00" 을 표현하는 Date(UTC midnight) 정규화.
 * 입력 Date 의 KST 연·월을 추출해 `new Date(Date.UTC(year, monthIndex, 1))` 로 반환.
 * 이미 1일이 아니면 throw — 매월 1일만 허용.
 */
function normalizeContractFromDate(d: Date): Date {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new Error("계약 시작일이 올바르지 않습니다");
  }
  // KST 로 환산 (UTC + 9h)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const monthIndex = kst.getUTCMonth();
  const day = kst.getUTCDate();
  if (day !== 1) {
    throw new Error("계약 시작일은 매월 1일이어야 합니다");
  }
  return new Date(Date.UTC(year, monthIndex, 1));
}

/**
 * KST 기준 하루(24h) 전 Date — effectiveTo 자동 마감용.
 * effectiveFrom 이 새 계약의 시작이면, 직전 계약의 effectiveTo = effectiveFrom - 1day.
 */
function previousDay(d: Date): Date {
  return new Date(d.getTime() - 24 * 60 * 60 * 1000);
}

export async function createContract(
  userId: string,
  data: {
    effectiveFrom: Date;
    hourlyRate: number;
    monthlySalary?: number | null; // 월 기본급(고정). 설정 시 시급 대신 적용
    weeklyHolidayPay?: boolean;
    monthlyBonusKrw?: number;
    note?: string;
    workDays?: number[]; // 0=일 .. 6=토
    workStartTime?: string; // "14:00"
    workEndTime?: string; // "22:00"
  },
) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  if (!userId) throw new Error("대상 사용자가 지정되지 않았습니다");

  const effectiveFrom = normalizeContractFromDate(data.effectiveFrom);

  if (!Number.isFinite(data.hourlyRate) || data.hourlyRate <= 0) {
    throw new Error("시급은 0보다 커야 합니다");
  }
  const hourlyRate = Math.round(data.hourlyRate);
  const monthlySalary =
    data.monthlySalary != null && data.monthlySalary > 0 ? Math.round(data.monthlySalary) : null;
  const weeklyHolidayPay = data.weeklyHolidayPay ?? true;
  const monthlyBonusKrw = Math.max(0, Math.round(data.monthlyBonusKrw ?? 0));
  const note = data.note?.trim() || null;

  // 계약상 근무 조건 (요일 + 시작/종료) — 유효 요일만, HH:MM 형식 검증
  const timeRe = /^\d{2}:\d{2}$/;
  const workDays = Array.from(new Set((data.workDays ?? []).filter((d) => d >= 0 && d <= 6))).sort((a, b) => a - b);
  const workStartTime = data.workStartTime && timeRe.test(data.workStartTime) ? data.workStartTime : null;
  const workEndTime = data.workEndTime && timeRe.test(data.workEndTime) ? data.workEndTime : null;
  const hasSchedule = workDays.length > 0 && workStartTime != null && workEndTime != null;

  // 직전 활성 계약(effectiveTo=null) 조회 후 트랜잭션으로 마감 + 신규 생성
  const current = await prisma.payrollContract.findFirst({
    where: { userId, effectiveTo: null },
    orderBy: { effectiveFrom: "desc" },
  });

  if (current && current.effectiveFrom >= effectiveFrom) {
    throw new Error("신규 계약 시작일은 직전 계약 시작일보다 이후여야 합니다");
  }

  const newEffectiveTo = previousDay(effectiveFrom);

  const ops = [];
  if (current) {
    ops.push(
      prisma.payrollContract.update({
        where: { id: current.id },
        data: { effectiveTo: newEffectiveTo },
      }),
    );
  }
  ops.push(
    prisma.payrollContract.create({
      data: {
        userId,
        effectiveFrom,
        hourlyRate,
        monthlySalary,
        weeklyHolidayPay,
        monthlyBonusKrw,
        workDays,
        workStartTime,
        workEndTime,
        note,
        createdById: session!.user!.id,
      },
    }),
  );

  // 계약 입력이 주간 일정(MentorSchedule)도 함께 설정 — 선택 요일만 남기고 동기화
  if (hasSchedule) {
    ops.push(prisma.mentorSchedule.deleteMany({ where: { mentorId: userId } }));
    for (const day of workDays) {
      ops.push(
        prisma.mentorSchedule.create({
          data: { mentorId: userId, dayOfWeek: day, timeStart: workStartTime!, timeEnd: workEndTime! },
        }),
      );
    }
  }

  const results = await prisma.$transaction(ops);
  // 신규 계약은 update(있으면) 다음, schedule ops 이전 위치 → 인덱스로 특정
  const created = results[current ? 1 : 0];

  revalidatePath("/payroll");
  revalidatePath("/mentors");
  return created;
}

export async function listContracts(userId: string) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  if (!userId) throw new Error("대상 사용자가 지정되지 않았습니다");

  return prisma.payrollContract.findMany({
    where: { userId },
    orderBy: { effectiveFrom: "desc" },
  });
}

export async function terminateContract(contractId: string, effectiveTo: Date) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  if (!contractId) throw new Error("계약 ID가 지정되지 않았습니다");
  if (!(effectiveTo instanceof Date) || Number.isNaN(effectiveTo.getTime())) {
    throw new Error("계약 종료일이 올바르지 않습니다");
  }

  const contract = await prisma.payrollContract.findUnique({
    where: { id: contractId },
  });
  if (!contract) throw new Error("계약을 찾을 수 없습니다");

  if (effectiveTo < contract.effectiveFrom) {
    throw new Error("종료일은 시작일 이후여야 합니다");
  }

  const updated = await prisma.payrollContract.update({
    where: { id: contractId },
    data: { effectiveTo },
  });

  revalidatePath("/payroll");
  return updated;
}

/**
 * 주어진 일자(ymd) 에 활성인 계약을 반환. effectiveFrom <= ymd <= (effectiveTo ?? ∞).
 * 순수 read — 권한 체크 없음(서버 액션 내부 헬퍼). 단일 진입점.
 *
 * TODO(PR 3.3+): PayrollSetting 직접 조회 코드(`calculateMonthlyPayroll` 등)를
 * 모두 이 함수로 교체. PayrollSetting 은 빠른 표시용 캐시로만 유지.
 */
export async function getActiveContractFor(userId: string, ymd: Date) {
  if (!userId) return null;
  if (!(ymd instanceof Date) || Number.isNaN(ymd.getTime())) return null;

  return prisma.payrollContract.findFirst({
    where: {
      userId,
      effectiveFrom: { lte: ymd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: ymd } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

// ──────────────────────────────────────────────────────────────────
// 근무시간 수기 입력 (WorkTag 태깅 대체) — 본인/원장
// 일자별 WorkHourEntry + 월 단위 WorkMonth(비고·확인). 분 단위 저장.
// ──────────────────────────────────────────────────────────────────

export type WorkSheetDay = { date: string; minutes: number; note: string | null };
export type WorkSheetUser = {
  userId: string;
  name: string;
  role: string;
  status: UserStatus;
  hourlyRate: number;
  monthlySalary: number | null;
  weeklyHolidayPay: boolean;
  days: WorkSheetDay[]; // 입력된 일자만 (sparse) — 클라이언트가 그리드 채움
  extraMinutes: number;
  extraNote: string | null;
  staffConfirmedAt: string | null;
  ownerConfirmedAt: string | null;
  pay: EntryPayrollResult;
};
export type MonthlyWorkSheet = {
  year: number;
  month: number;
  daysInMonth: number;
  users: WorkSheetUser[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD → @db.Date 용 UTC 자정 Date. 형식 검증. */
function parseWorkDate(dateStr: string): Date {
  if (!DATE_RE.test(dateStr)) throw new Error("날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)");
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("날짜가 올바르지 않습니다");
  return d;
}

/** 시간(소수, 예 7.5) → 분. 0~24h 검증. */
function hoursToMinutes(hours: number): number {
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
    throw new Error("근무시간은 0~24시간 사이여야 합니다");
  }
  return Math.round(hours * 60);
}

/** 해당 월 @db.Date 범위 [gte, lt) — UTC 기준. */
function monthRange(year: number, month: number) {
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 한 사용자·한 달의 수기입력·비고·계약·급여를 묶어서 반환. */
async function loadUserMonth(
  userId: string,
  year: number,
  month: number,
): Promise<Omit<WorkSheetUser, "name" | "role" | "status">> {
  const range = monthRange(year, month);
  const ymd = new Date(Date.UTC(year, month - 1, 1));
  const [entries, workMonth, contract] = await Promise.all([
    prisma.workHourEntry.findMany({
      where: { userId, workDate: range },
      orderBy: { workDate: "asc" },
      select: { workDate: true, minutes: true, note: true },
    }),
    prisma.workMonth.findUnique({ where: { userId_year_month: { userId, year, month } } }),
    getActiveContractFor(userId, ymd),
  ]);

  const days: WorkSheetDay[] = entries.map((e) => ({
    date: isoDate(e.workDate),
    minutes: e.minutes,
    note: e.note,
  }));
  const extraMinutes = workMonth?.extraMinutes ?? 0;
  const hourlyRate = contract?.hourlyRate ?? 0;
  const monthlySalary = contract?.monthlySalary ?? null;
  const weeklyHolidayPay = contract?.weeklyHolidayPay ?? false;

  const pay = calculatePayrollFromEntries(
    entries.map((e) => ({ date: e.workDate, minutes: e.minutes })),
    extraMinutes,
    hourlyRate,
    weeklyHolidayPay,
    monthlySalary,
  );

  return {
    userId,
    hourlyRate,
    monthlySalary,
    weeklyHolidayPay,
    days,
    extraMinutes,
    extraNote: workMonth?.extraNote ?? null,
    staffConfirmedAt: workMonth?.staffConfirmedAt?.toISOString() ?? null,
    ownerConfirmedAt: workMonth?.ownerConfirmedAt?.toISOString() ?? null,
    pay,
  };
}

// ── 근무자 본인 ──────────────────────────────────────────────────

/** 본인 한 달 근무시트(입력·비고·확인·급여). */
export async function getMyWorkSheet(year: number, month: number): Promise<WorkSheetUser> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const base = await loadUserMonth(session.user.id, year, month);
  return { ...base, name: session.user.name ?? "", role: session.user.role ?? "", status: "ACTIVE" };
}

/** 본인 일자별 근무시간 입력/수정. 원장 확인(잠금) 후엔 차단. */
export async function setMyWorkHour(dateStr: string, hours: number, note?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;
  const workDate = parseWorkDate(dateStr);
  const minutes = hoursToMinutes(hours);

  // 해당 월이 사업자 확인(잠금)됐는지 검사
  const kst = new Date(workDate.getTime());
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const wm = await prisma.workMonth.findUnique({ where: { userId_year_month: { userId, year, month } } });
  if (wm?.ownerConfirmedAt) throw new Error("원장 확인이 완료된 달은 수정할 수 없습니다");

  await prisma.workHourEntry.upsert({
    where: { userId_workDate: { userId, workDate } },
    update: { minutes, note: note?.trim() || null, enteredById: userId },
    create: { userId, workDate, minutes, note: note?.trim() || null, enteredById: userId },
  });
  revalidatePath("/payroll/me");
  revalidatePath("/payroll");
  return { ok: true };
}

/** 본인 비고(추가근무) 입력/수정. */
export async function setMyMonthExtra(year: number, month: number, hours: number, note?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;
  const minutes = hoursToMinutes(hours);

  const wm = await prisma.workMonth.findUnique({ where: { userId_year_month: { userId, year, month } } });
  if (wm?.ownerConfirmedAt) throw new Error("원장 확인이 완료된 달은 수정할 수 없습니다");

  await prisma.workMonth.upsert({
    where: { userId_year_month: { userId, year, month } },
    update: { extraMinutes: minutes, extraNote: note?.trim() || null, updatedById: userId },
    create: { userId, year, month, extraMinutes: minutes, extraNote: note?.trim() || null, updatedById: userId },
  });
  revalidatePath("/payroll/me");
  revalidatePath("/payroll");
  return { ok: true };
}

/** 본인 확인(✔) 토글. */
export async function confirmMyWorkMonth(year: number, month: number, confirmed: boolean) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;
  const at = confirmed ? new Date() : null;
  await prisma.workMonth.upsert({
    where: { userId_year_month: { userId, year, month } },
    update: { staffConfirmedAt: at, updatedById: userId },
    create: { userId, year, month, staffConfirmedAt: at, updatedById: userId },
  });
  revalidatePath("/payroll/me");
  revalidatePath("/payroll");
  return { ok: true };
}

// ── 원장(FULL_ACCESS) ────────────────────────────────────────────

/** 전 직원 한 달 근무시트 — 사진의 표 1개에 필요한 모든 데이터. */
export async function getMonthlyWorkSheet(year: number, month: number): Promise<MonthlyWorkSheet> {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const range = monthRange(year, month);
  // 재직 직원 + 그 달에 데이터가 있는 직원(퇴사자 포함)
  const staff = await prisma.user.findMany({
    where: {
      role: { in: [...STAFF_ROLES] },
      OR: [
        { status: "ACTIVE" },
        { workHourEntries: { some: { workDate: range } } },
        { workMonths: { some: { year, month } } },
      ],
    },
    select: { id: true, name: true, role: true, status: true },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  const users = await Promise.all(
    staff.map(async (u) => {
      const base = await loadUserMonth(u.id, year, month);
      return { ...base, name: u.name, role: u.role, status: u.status };
    }),
  );

  return { year, month, daysInMonth: new Date(year, month, 0).getDate(), users };
}

/** 원장: 임의 직원 일자별 근무시간 입력/수정. */
export async function setStaffWorkHour(userId: string, dateStr: string, hours: number, note?: string) {
  const session = await auth();
  requireFullAccess(session?.user?.role);
  if (!userId) throw new Error("대상 사용자가 지정되지 않았습니다");
  const workDate = parseWorkDate(dateStr);
  const minutes = hoursToMinutes(hours);

  await prisma.workHourEntry.upsert({
    where: { userId_workDate: { userId, workDate } },
    update: { minutes, note: note?.trim() || null, enteredById: session!.user!.id },
    create: { userId, workDate, minutes, note: note?.trim() || null, enteredById: session!.user!.id },
  });
  revalidatePath("/payroll");
  revalidatePath("/payroll/me");
  return { ok: true };
}

/** 원장: 임의 직원 비고(추가근무) 입력/수정. */
export async function setStaffMonthExtra(
  userId: string,
  year: number,
  month: number,
  hours: number,
  note?: string,
) {
  const session = await auth();
  requireFullAccess(session?.user?.role);
  if (!userId) throw new Error("대상 사용자가 지정되지 않았습니다");
  const minutes = hoursToMinutes(hours);

  await prisma.workMonth.upsert({
    where: { userId_year_month: { userId, year, month } },
    update: { extraMinutes: minutes, extraNote: note?.trim() || null, updatedById: session!.user!.id },
    create: { userId, year, month, extraMinutes: minutes, extraNote: note?.trim() || null, updatedById: session!.user!.id },
  });
  revalidatePath("/payroll");
  revalidatePath("/payroll/me");
  return { ok: true };
}

/** 원장: 사업자 확인(✔) 토글. */
export async function ownerConfirmWorkMonth(
  userId: string,
  year: number,
  month: number,
  confirmed: boolean,
) {
  const session = await auth();
  requireFullAccess(session?.user?.role);
  if (!userId) throw new Error("대상 사용자가 지정되지 않았습니다");
  const at = confirmed ? new Date() : null;
  await prisma.workMonth.upsert({
    where: { userId_year_month: { userId, year, month } },
    update: { ownerConfirmedAt: at, updatedById: session!.user!.id },
    create: { userId, year, month, ownerConfirmedAt: at, updatedById: session!.user!.id },
  });
  revalidatePath("/payroll");
  revalidatePath("/payroll/me");
  return { ok: true };
}
