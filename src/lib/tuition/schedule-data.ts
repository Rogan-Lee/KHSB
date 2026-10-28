// 청구 일정 입력 모으기 (서버 전용) — 수강료 화면(admin-data)과 자동 청구 cron(reconcile)이 같이 쓴다.
// 계산은 schedule.ts 의 순수 함수가 한다.

import { prisma } from "@/lib/prisma";
import { isOverdue, kstDateOf } from "@/lib/tuition/calc";
import { planOf } from "@/lib/tuition/pricing";
import { planStudentSchedule, type ScheduleEntry } from "@/lib/tuition/schedule";
import type { TuitionSettingValues } from "@/lib/tuition/settings";

export type ScheduleStudent = {
  id: string;
  name: string;
  grade: string;
  seat: string | null;
  status: "ACTIVE";
  /** 반 이름 (정규반·선택반) */
  planName: string;
  /** 학생별 수강료 (없으면 null — 반 금액을 쓴다) */
  monthlyFee: number | null;
  /** 학생별 → 반 월 수강료 */
  effectiveMonthlyFee: number;
  /** 학생별 → 반 세 달 선등록 월 수강료 */
  prepayMonthlyFee: number;
  billingPaused: boolean;
  billingAnchor: Date | null;
  /** 보류 사유 */
  holdReason: string | null;
  memo: string | null;
  /** 퇴원 예정일 */
  withdrawOn: Date | null;
  /** 납부한 이용 기간의 끝 */
  coverageEnd: Date | null;
  /** 결제 요청(미납 포함) 청구서가 있는지 */
  hasOpenInvoice: boolean;
  /** 다음 청구의 이용 시작일 (청구 제외 학생도 계산한다 — 직접 발행할 때 기본값) */
  nextPeriodStart: Date;
  /** 다음 청구 — 청구 제외 학생은 빈 배열 */
  entries: ScheduleEntry[];
};

/** 재원생 전부의 다음 청구. 이름순 */
export async function loadTuitionSchedule(today: Date, setting: TuitionSettingValues): Promise<ScheduleStudent[]> {
  const [students, latestPaid, open] = await Promise.all([
    prisma.student.findMany({
      // 재원 중인 학생 전부 (오프라인·온라인 관리 구분 없이)
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        grade: true,
        seat: true,
        classGroup: true,
        startDate: true,
        endDate: true,
        tuitionProfile: {
          select: { monthlyFee: true, billingPaused: true, billingAnchor: true, holdReason: true, memo: true },
        },
      },
    }),
    // 학생별 가장 늦게 끝나는 납부 기간 — 학생당 한 줄 (개월 수는 세 달 선등록을 이어 가는 데 쓴다)
    prisma.tuitionInvoice.findMany({
      where: {
        status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] },
        coverageEnd: { not: null },
        student: { status: "ACTIVE" },
      },
      orderBy: [{ studentId: "asc" }, { coverageEnd: "desc" }],
      distinct: ["studentId"],
      select: { studentId: true, coverageEnd: true, months: true },
    }),
    // 아직 받지 못한 청구서 — 다음 청구는 그 뒤부터, 기한이 지났으면 독촉이 먼저
    prisma.tuitionInvoice.findMany({
      where: { status: "REQUESTED", student: { status: "ACTIVE" } },
      select: { studentId: true, status: true, periodEnd: true, dueDate: true },
    }),
  ]);

  const paidByStudent = new Map(latestPaid.map((row) => [row.studentId, row]));
  const openByStudent = new Map<string, { until: Date; overdue: number }>();
  for (const invoice of open) {
    const prev = openByStudent.get(invoice.studentId);
    const until = prev && prev.until.getTime() > invoice.periodEnd.getTime() ? prev.until : invoice.periodEnd;
    openByStudent.set(invoice.studentId, {
      until,
      overdue: (prev?.overdue ?? 0) + (isOverdue(invoice, today) ? 1 : 0),
    });
  }

  const { pricing } = setting;
  return students.map((student) => {
    const profile = student.tuitionProfile;
    const plan = planOf(student.classGroup, pricing);
    const paid = paidByStudent.get(student.id);
    const coverageEnd = paid?.coverageEnd ?? null;
    const openInfo = openByStudent.get(student.id);
    const billedUntil =
      openInfo && (!coverageEnd || openInfo.until.getTime() > coverageEnd.getTime()) ? openInfo.until : coverageEnd;
    const customMonthlyFee = profile?.monthlyFee ?? null;
    const billingPaused = profile?.billingPaused ?? false;
    const withdrawOn = student.endDate ? kstDateOf(student.endDate) : null;
    const entries = planStudentSchedule(
      {
        enrolledOn: kstDateOf(student.startDate),
        withdrawOn,
        plan,
        customMonthlyFee,
        anchor: profile?.billingAnchor ?? null,
        billedUntil,
        lastMonths: paid?.months ?? null,
        overdueCount: openInfo?.overdue ?? 0,
        holdReason: profile?.holdReason ?? null,
      },
      { today, autoIssueLeadDays: setting.autoIssueLeadDays, pricing },
    );
    return {
      id: student.id,
      name: student.name,
      grade: student.grade,
      seat: student.seat,
      status: "ACTIVE",
      planName: plan.name,
      monthlyFee: customMonthlyFee,
      effectiveMonthlyFee: customMonthlyFee ?? plan.monthlyFee,
      prepayMonthlyFee: customMonthlyFee ?? plan.prepayMonthlyFee,
      billingPaused,
      billingAnchor: profile?.billingAnchor ?? null,
      holdReason: profile?.holdReason ?? null,
      memo: profile?.memo ?? null,
      withdrawOn,
      coverageEnd,
      hasOpenInvoice: openInfo !== undefined,
      nextPeriodStart: entries[0].periodStart,
      entries: billingPaused ? [] : entries,
    };
  });
}
