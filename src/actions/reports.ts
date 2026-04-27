"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { startOfMonth, endOfMonth } from "date-fns";
import { requireStaff, requireFullAccess } from "@/lib/roles";
import crypto from "crypto";

// ─── 순공 시간 계산 헬퍼 ──────────────────────────────────────────────

type AttendanceWithTimes = {
  checkIn: Date | null;
  checkOut: Date | null;
  outStart: Date | null;
  outEnd: Date | null;
};

/**
 * 두 DateTime 차이를 분 단위로 반환 (음수면 0).
 */
function diffMinutes(from: Date | null, to: Date | null): number {
  if (!from || !to) return 0;
  const diff = (to.getTime() - from.getTime()) / (1000 * 60);
  return Math.max(Math.round(diff), 0);
}

/**
 * 하루의 순공 시간을 분 단위로 계산.
 * checkIn~checkOut 간격에서 outStart~outEnd 구간을 차감.
 */
function calcStudyMinutes(record: AttendanceWithTimes): number {
  const total = diffMinutes(record.checkIn, record.checkOut);
  if (total === 0) return 0;
  const outing = diffMinutes(record.outStart, record.outEnd);
  return Math.max(total - outing, 0);
}

/**
 * 학생의 월간 총 순공 시간(분) 계산 (AttendanceRecord + DailyOuting 차감).
 */
export async function getMonthlyStudyMinutes(
  studentId: string,
  year: number,
  month: number
): Promise<number> {
  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));

  const [attendances, dailyOutings] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { studentId, date: { gte: start, lte: end } },
      select: { checkIn: true, checkOut: true, outStart: true, outEnd: true, date: true },
    }),
    prisma.dailyOuting.findMany({
      where: { studentId, date: { gte: start, lte: end } },
      select: { outStart: true, outEnd: true },
    }),
  ]);

  const attendanceMinutes = attendances.reduce((sum, r) => sum + calcStudyMinutes(r), 0);
  const dailyOutingMinutes = dailyOutings.reduce(
    (sum, o) => sum + diffMinutes(o.outStart, o.outEnd),
    0
  );

  return Math.max(attendanceMinutes - dailyOutingMinutes, 0);
}

/**
 * 모든 ACTIVE 학생의 월간 순공시간을 SQL 일괄 집계로 계산.
 * 개별 쿼리 N+1 문제 제거 (200쿼리 → 2쿼리).
 */
export async function getStudyRankMap(year: number, month: number) {
  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));

  // 1. 출결 기반 체류시간 일괄 집계
  const attendanceData = await prisma.attendanceRecord.findMany({
    where: { date: { gte: start, lte: end }, student: { status: "ACTIVE" } },
    select: { studentId: true, checkIn: true, checkOut: true, outStart: true, outEnd: true },
  });

  // 2. 당일 외출 일괄 집계
  const dailyOutingData = await prisma.dailyOuting.findMany({
    where: { date: { gte: start, lte: end }, student: { status: "ACTIVE" } },
    select: { studentId: true, outStart: true, outEnd: true },
  });

  // 학생별 순공시간 합산
  const minutesByStudent = new Map<string, number>();

  for (const r of attendanceData) {
    const mins = calcStudyMinutes(r);
    minutesByStudent.set(r.studentId, (minutesByStudent.get(r.studentId) ?? 0) + mins);
  }
  for (const o of dailyOutingData) {
    const mins = diffMinutes(o.outStart, o.outEnd);
    if (mins > 0) {
      minutesByStudent.set(o.studentId, (minutesByStudent.get(o.studentId) ?? 0) - mins);
    }
  }

  // ACTIVE 학생 중 데이터 없는 학생도 포함
  const activeStudents = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  for (const s of activeStudents) {
    if (!minutesByStudent.has(s.id)) minutesByStudent.set(s.id, 0);
  }

  // 내림차순 정렬 후 순위 매기기
  const entries = Array.from(minutesByStudent.entries())
    .map(([studentId, minutes]) => ({ studentId, minutes: Math.max(minutes, 0) }))
    .sort((a, b) => b.minutes - a.minutes);

  const rankMap: Record<string, { rank: number; total: number; minutes: number }> = {};
  entries.forEach((e, i) => {
    rankMap[e.studentId] = { rank: i + 1, total: entries.length, minutes: e.minutes };
  });

  return rankMap;
}

/**
 * 특정 학년의 월간 평균 순공시간(분) — getStudyRankMap 결과 재활용.
 */
export async function getGradeAverageStudyMinutes(
  grade: string,
  year: number,
  month: number,
  rankMap?: Record<string, { rank: number; total: number; minutes: number }>
): Promise<number> {
  const students = await prisma.student.findMany({
    where: { status: "ACTIVE", grade },
    select: { id: true },
  });
  if (students.length === 0) return 0;

  // rankMap이 이미 계산되어 있으면 재활용
  if (rankMap) {
    const sum = students.reduce((acc, s) => acc + (rankMap[s.id]?.minutes ?? 0), 0);
    return Math.round(sum / students.length);
  }

  // fallback: 개별 계산
  const totals = await Promise.all(
    students.map((s) => getMonthlyStudyMinutes(s.id, year, month))
  );
  const sum = totals.reduce((a, b) => a + b, 0);
  return Math.round(sum / students.length);
}

/**
 * 학생의 월간 외출 (횟수, 총 분) 계산.
 */
async function getMonthlyOutingStats(
  studentId: string,
  year: number,
  month: number
): Promise<{ count: number; totalMinutes: number }> {
  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));

  const [attendances, dailyOutings] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { studentId, date: { gte: start, lte: end }, outStart: { not: null } },
      select: { outStart: true, outEnd: true },
    }),
    prisma.dailyOuting.findMany({
      where: { studentId, date: { gte: start, lte: end } },
      select: { outStart: true, outEnd: true },
    }),
  ]);

  let total = 0;
  let count = 0;
  for (const a of attendances) {
    const d = diffMinutes(a.outStart, a.outEnd);
    if (d > 0) {
      total += d;
      count += 1;
    }
  }
  for (const o of dailyOutings) {
    const d = diffMinutes(o.outStart, o.outEnd);
    if (d > 0) {
      total += d;
      count += 1;
    }
  }
  return { count, totalMinutes: total };
}

// ─── 학습 정량 분석 (멘토링 페이지 상단 노출용) ────────────────────────

/**
 * 멘토링 화면에서 멘토/학생이 함께 볼 수 있는 학습 정량 분석.
 * MonthlyReport 와 동일한 메트릭을 실시간 계산 (스냅샷 X).
 * 인증 안 함 — 멘토링 페이지 자체가 STAFF 전용 라우트라 그쪽에서 보호.
 */
export async function getStudentStudyAnalysis(
  studentId: string,
  year: number,
  month: number,
) {
  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { grade: true },
  });
  if (!student) return null;

  const [attendances, rankMap, outing] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { studentId, date: { gte: start, lte: end } },
      select: { type: true },
    }),
    getStudyRankMap(year, month),
    getMonthlyOutingStats(studentId, year, month),
  ]);

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const [prevMonthStudyMinutes, gradeAvgMinutes] = await Promise.all([
    getMonthlyStudyMinutes(studentId, prevYear, prevMonth),
    getGradeAverageStudyMinutes(student.grade, year, month, rankMap),
  ]);

  const myRank = rankMap[studentId];

  return {
    grade: student.grade,
    attendanceDays: attendances.filter((a) => a.type === "NORMAL").length,
    absentDays: attendances.filter((a) => a.type === "ABSENT").length,
    tardyCount: attendances.filter((a) => a.type === "TARDY").length,
    earlyLeaveCount: attendances.filter((a) => a.type === "EARLY_LEAVE").length,
    totalStudyMinutes: myRank?.minutes ?? 0,
    prevMonthStudyMinutes,
    gradeAvgMinutes,
    outingCount: outing.count,
    studyRankInRoom: myRank?.rank ?? null,
    studyRankTotal: myRank?.total ?? null,
  };
}

// ─── 월간 리포트 생성 ─────────────────────────────────────────────────

export async function generateMonthlyReport(
  studentId: string,
  year: number,
  month: number
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, grade: true },
  });
  if (!student) throw new Error("학생을 찾을 수 없습니다");

  const [attendances, merits, mentorings, rankMap] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { studentId, date: { gte: start, lte: end } },
    }),
    prisma.meritDemerit.findMany({
      where: { studentId, date: { gte: start, lte: end } },
    }),
    prisma.mentoring.findMany({
      where: {
        studentId,
        scheduledAt: { gte: start, lte: end },
        status: "COMPLETED",
      },
    }),
    getStudyRankMap(year, month),
  ]);

  // 전월 순공 시간
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const [prevMonthStudyMinutes, gradeAvg, outing] = await Promise.all([
    getMonthlyStudyMinutes(studentId, prevYear, prevMonth),
    getGradeAverageStudyMinutes(student.grade, year, month, rankMap),
    getMonthlyOutingStats(studentId, year, month),
  ]);

  const myRank = rankMap[studentId];

  const stats = {
    attendanceDays: attendances.filter((a) => a.type === "NORMAL").length,
    absentDays: attendances.filter((a) => a.type === "ABSENT").length,
    tardyCount: attendances.filter((a) => a.type === "TARDY").length,
    earlyLeaveCount: attendances.filter((a) => a.type === "EARLY_LEAVE").length,
    totalMerits: merits.filter((m) => m.type === "MERIT").reduce((a, m) => a + m.points, 0),
    totalDemerits: merits.filter((m) => m.type === "DEMERIT").reduce((a, m) => a + m.points, 0),
    mentoringCount: mentorings.length,
    totalStudyMinutes: myRank?.minutes ?? 0,
    prevMonthStudyMinutes,
    studyRankInRoom: myRank?.rank ?? null,
    studyRankTotal: myRank?.total ?? null,
    gradeAvgMinutes: gradeAvg,
    outingCount: outing.count,
    totalOutingMinutes: outing.totalMinutes,
  };

  const report = await prisma.monthlyReport.upsert({
    where: { studentId_year_month: { studentId, year, month } },
    create: { studentId, year, month, ...stats },
    update: stats,
  });

  // 리포트 저장 후 자동 사진 첨부 (§2.22). 실패해도 리포트 생성은 유지.
  try {
    await autoAttachPhotosToReport(report.id);
  } catch {
    // Silent — 사진 첨부 실패가 리포트 실패로 이어지지 않도록
  }

  revalidatePath("/reports");
  return report;
}

/**
 * §2.22: 해당 리포트의 studentId + 월 범위에 해당하는 Photo 를 최신 N장(기본 3) 자동 첨부.
 * - 파일명 파싱된 parsedDate 가 월 범위에 들어가는 사진만 대상
 * - attachedPhotoIds 필드에 ID 배열 저장 (덮어쓰기)
 */
export async function autoAttachPhotosToReport(reportId: string, limit = 3) {
  const report = await prisma.monthlyReport.findUnique({
    where: { id: reportId },
    select: { studentId: true, year: true, month: true },
  });
  if (!report) throw new Error("리포트를 찾을 수 없습니다");

  const start = new Date(report.year, report.month - 1, 1);
  const end = new Date(report.year, report.month, 1);

  const photos = await prisma.photo.findMany({
    where: {
      studentId: report.studentId,
      parsedDate: { gte: start, lt: end },
    },
    orderBy: { parsedDate: "desc" },
    take: limit,
    select: { id: true },
  });

  await prisma.monthlyReport.update({
    where: { id: reportId },
    data: { attachedPhotoIds: photos.map((p) => p.id) },
  });

  return photos.length;
}

/**
 * 리포트 상세 수동 사진 편집용 — 해당 리포트의 학생/월에 해당하는 Photo 목록 반환.
 */
export async function getPhotosForReportPeriod(reportId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  const report = await prisma.monthlyReport.findUnique({
    where: { id: reportId },
    select: { studentId: true, year: true, month: true, attachedPhotoIds: true },
  });
  if (!report) throw new Error("리포트를 찾을 수 없습니다");

  const from = new Date(report.year, report.month - 1, 1);
  const to = new Date(report.year, report.month, 1);

  const photos = await prisma.photo.findMany({
    where: { studentId: report.studentId, parsedDate: { gte: from, lt: to } },
    orderBy: { parsedDate: "desc" },
    select: {
      id: true,
      url: true,
      thumbnailUrl: true,
      fileName: true,
      parsedDate: true,
    },
  });

  return { photos, selectedIds: report.attachedPhotoIds };
}

/**
 * 수동 사진 첨부/해제 (관리자 UI).
 */
export async function setReportPhotos(reportId: string, photoIds: string[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  await prisma.monthlyReport.update({
    where: { id: reportId },
    data: { attachedPhotoIds: photoIds },
  });
  revalidatePath("/reports");
  revalidatePath("/reports/monthly");
}

export type BulkReportResult = {
  studentId: string;
  status: "success" | "failed";
  reason?: string;
};

/**
 * 여러 학생의 월간 리포트를 병렬 생성.
 * - concurrency=5 (DB 부하 제어)
 * - 개별 실패 시 그 학생만 failed 로 표시, 나머지는 계속 진행
 */
export async function generateMonthlyReportsBulk(
  studentIds: string[],
  year: number,
  month: number
): Promise<BulkReportResult[]> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  const concurrency = 5;
  const unique = Array.from(new Set(studentIds));
  const results: BulkReportResult[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < unique.length) {
      const idx = cursor++;
      const sid = unique[idx];
      if (!sid) continue;
      try {
        await generateMonthlyReport(sid, year, month);
        results.push({ studentId: sid, status: "success" });
      } catch (e) {
        results.push({
          studentId: sid,
          status: "failed",
          reason: e instanceof Error ? e.message : "알 수 없는 오류",
        });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  revalidatePath("/reports/monthly");
  return results;
}

export async function updateReportComment(id: string, overallComment: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  await prisma.monthlyReport.update({ where: { id }, data: { overallComment } });
  revalidatePath("/reports");
}

export async function updateReportMentoringSummary(id: string, mentoringSummary: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  await prisma.monthlyReport.update({ where: { id }, data: { mentoringSummary } });
  revalidatePath("/reports");
}

export async function markReportSent(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  await prisma.monthlyReport.update({ where: { id }, data: { sentAt: new Date() } });
  revalidatePath("/reports");
}

/**
 * 여러 리포트를 일괄 발송 처리 (sentAt 기록).
 * 이미 발송된 건은 skip, 발송 전 건만 업데이트.
 */
export async function markReportsSentBulk(ids: string[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  if (ids.length === 0) return { updated: 0 };

  const result = await prisma.monthlyReport.updateMany({
    where: { id: { in: ids }, sentAt: null },
    data: { sentAt: new Date() },
  });
  revalidatePath("/reports");
  revalidatePath("/reports/monthly");
  return { updated: result.count };
}

/**
 * 여러 리포트의 공유 토큰을 한번에 확보 (복사·일괄 공유용).
 * 기존 토큰이 있으면 재사용, 없으면 생성.
 */
export async function ensureShareTokensBulk(ids: string[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  if (ids.length === 0) return [];

  const reports = await prisma.monthlyReport.findMany({
    where: { id: { in: ids } },
    include: { student: { select: { name: true } } },
  });

  const results: { id: string; studentName: string; token: string }[] = [];
  for (const r of reports) {
    let token = r.shareToken;
    if (!token) {
      token = crypto.randomUUID();
      await prisma.monthlyReport.update({ where: { id: r.id }, data: { shareToken: token } });
    }
    results.push({ id: r.id, studentName: r.student.name, token });
  }
  revalidatePath("/reports/monthly");
  return results;
}

export async function getMonthlyReports(year: number, month: number) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  return prisma.monthlyReport.findMany({
    where: { year, month },
    include: {
      student: { select: { id: true, name: true, grade: true, parentPhone: true } },
    },
    orderBy: { student: { name: "asc" } },
  });
}

/**
 * 이번 달 멘토링 기록을 자동으로 분석·요약 (AI 없이, 구조화된 추출).
 * 각 멘토링의 content/improvements/weaknesses/nextGoals를 일자별로 정리하여 마크다운 반환.
 */
export async function extractMonthlyMentoringDigest(
  studentId: string,
  year: number,
  month: number
): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));

  const mentorings = await prisma.mentoring.findMany({
    where: {
      studentId,
      scheduledAt: { gte: start, lte: end },
      status: "COMPLETED",
    },
    select: {
      actualDate: true,
      scheduledAt: true,
      content: true,
      improvements: true,
      weaknesses: true,
      nextGoals: true,
      notes: true,
      mentor: { select: { name: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  if (mentorings.length === 0) {
    return `${year}년 ${month}월 진행된 멘토링이 없습니다.`;
  }

  // 마크다운으로 회차별 정리
  const sections: string[] = [
    `**${year}년 ${month}월 총 ${mentorings.length}회 멘토링 진행**`,
    "",
  ];

  mentorings.forEach((m, i) => {
    const date = m.actualDate ?? m.scheduledAt;
    const dateStr = new Date(date).toLocaleDateString("ko-KR", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });
    sections.push(`### ${i + 1}회차 · ${dateStr} (${m.mentor?.name ?? "담당 멘토"})`);
    if (m.content?.trim()) sections.push(`**내용**\n${m.content.trim()}`);
    if (m.improvements?.trim()) sections.push(`**성장한 점**\n${m.improvements.trim()}`);
    if (m.weaknesses?.trim()) sections.push(`**보완할 점**\n${m.weaknesses.trim()}`);
    if (m.nextGoals?.trim()) sections.push(`**다음 목표**\n${m.nextGoals.trim()}`);
    sections.push("");
  });

  return sections.join("\n");
}

/** 공유 토큰 발급 (없으면 생성) */
export async function ensureReportShareToken(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);

  const existing = await prisma.monthlyReport.findUnique({
    where: { id },
    select: { shareToken: true },
  });
  if (existing?.shareToken) return existing.shareToken;

  const token = crypto.randomBytes(16).toString("hex");
  await prisma.monthlyReport.update({ where: { id }, data: { shareToken: token } });
  revalidatePath("/reports");
  return token;
}

// ─── 월별 입시 정보 ───────────────────────────────────────────────────

export async function getMonthlyAdmissionInfo(year: number, month: number, grade?: string | null) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  // 학년별 > 전체 순으로 찾기
  if (grade) {
    const specific = await prisma.monthlyAdmissionInfo.findFirst({
      where: { year, month, grade },
    });
    if (specific) return specific;
  }
  return prisma.monthlyAdmissionInfo.findFirst({
    where: { year, month, grade: null },
  });
}

export async function upsertMonthlyAdmissionInfo(
  year: number,
  month: number,
  grade: string | null,
  content: string
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireFullAccess(session.user.role);

  const existing = await prisma.monthlyAdmissionInfo.findFirst({
    where: { year, month, grade: grade ?? null },
  });
  if (existing) {
    await prisma.monthlyAdmissionInfo.update({ where: { id: existing.id }, data: { content } });
  } else {
    await prisma.monthlyAdmissionInfo.create({ data: { year, month, grade: grade ?? null, content } });
  }
  revalidatePath("/reports");
}

// ─── 이달의 시상 ──────────────────────────────────────────────────────

export async function getMonthlyAwards(year: number, month: number) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return prisma.monthlyAward.findMany({
    where: { year, month },
    include: { student: { select: { id: true, name: true, grade: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function createMonthlyAward(
  year: number,
  month: number,
  category: "ATTITUDE" | "MENTOR_PICK" | "IMPROVEMENT",
  studentId: string,
  description?: string
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireFullAccess(session.user.role);
  await prisma.monthlyAward.create({ data: { year, month, category, studentId, description } });
  revalidatePath("/reports");
}

export async function deleteMonthlyAward(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireFullAccess(session.user.role);
  await prisma.monthlyAward.delete({ where: { id } });
  revalidatePath("/reports");
}
