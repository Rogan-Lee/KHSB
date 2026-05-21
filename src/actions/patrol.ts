"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { validateStaffMagicLink } from "@/lib/staff-auth";
import { hasGatePass } from "@/lib/token-auth";
import { todayKST } from "@/lib/utils";
import type { PatrolStatus } from "@/generated/prisma";

// ───────────────────── 포털(매직링크) 인증 ─────────────────────

/** 매직링크 토큰 + 게이트 통과 검증 → 순찰자(User) 반환. 실패 시 throw. */
async function requirePatroller(token: string): Promise<{ id: string; name: string }> {
  const validated = await validateStaffMagicLink(token);
  if (!validated) throw new Error("유효하지 않거나 만료된 링크입니다");
  const passed = await hasGatePass("STAFF", token, validated.user.id);
  if (!passed) throw new Error("본인 확인이 필요합니다");
  return { id: validated.user.id, name: validated.user.name };
}

// ───────────────────── 포털 데이터 ─────────────────────

export type PatrolRosterStudent = {
  id: string;
  name: string;
  grade: string;
  seat: string | null;
};

export type PatrolRecordView = {
  id: string;
  studentId: string;
  studentName: string;
  seat: string | null;
  status: PatrolStatus;
  note: string | null;
  checkedAt: string;
};

export type PatrolPortalData = {
  patrollerName: string;
  roster: PatrolRosterStudent[];
  // 잘못 스캔 시 검색·교체용 전체 재원 학생(좌석 QR 누락/오부착 대비)
  allStudents: PatrolRosterStudent[];
  activeRound: { id: string; label: string | null; startedAt: string } | null;
  records: PatrolRecordView[];
};

// QR 스캔 시 보여줄 학생 상세 (순찰에 유용한 메모 포함)
export type PatrolStudentInfo = {
  id: string;
  name: string;
  grade: string;
  school: string | null;
  seat: string | null;
  mentoringNotes: string | null;
  studentInfo: string | null;
  dailyNote: string | null; // 당일(오늘 KST)인 경우만
};

/** 오늘 재실(체크인) 학생 명단. 순찰 대상 roster. */
async function getTodayRoster(): Promise<PatrolRosterStudent[]> {
  const today = todayKST();
  const attendance = await prisma.attendanceRecord.findMany({
    where: { date: today, checkIn: { not: null } },
    select: { student: { select: { id: true, name: true, grade: true, seat: true, status: true } } },
  });
  return attendance
    .map((a) => a.student)
    .filter((s) => s.status === "ACTIVE")
    .map((s) => ({ id: s.id, name: s.name, grade: s.grade, seat: s.seat }))
    .sort((a, b) => (a.seat ?? "").localeCompare(b.seat ?? "", "ko") || a.name.localeCompare(b.name, "ko"));
}

function toRecordView(r: {
  id: string;
  studentId: string;
  status: PatrolStatus;
  note: string | null;
  checkedAt: Date;
  student: { name: string; seat: string | null };
}): PatrolRecordView {
  return {
    id: r.id,
    studentId: r.studentId,
    studentName: r.student.name,
    seat: r.student.seat,
    status: r.status,
    note: r.note,
    checkedAt: r.checkedAt.toISOString(),
  };
}

/** 포털 초기 데이터: roster + 전체 재원 + 진행 중 회차 + 그 회차 점검 기록. */
export async function getPatrolPortalData(token: string): Promise<PatrolPortalData> {
  const patroller = await requirePatroller(token);

  const [roster, allStudentRows, activeRound] = await Promise.all([
    getTodayRoster(),
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true, seat: true },
      orderBy: [{ seat: "asc" }, { name: "asc" }],
    }),
    prisma.patrolRound.findFirst({
      where: { endedAt: null },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  let records: PatrolRecordView[] = [];
  if (activeRound) {
    const rows = await prisma.patrolRecord.findMany({
      where: { roundId: activeRound.id },
      orderBy: { checkedAt: "desc" },
      select: {
        id: true, studentId: true, status: true, note: true, checkedAt: true,
        student: { select: { name: true, seat: true } },
      },
    });
    records = rows.map(toRecordView);
  }

  return {
    patrollerName: patroller.name,
    roster,
    allStudents: allStudentRows.map((s) => ({ id: s.id, name: s.name, grade: s.grade, seat: s.seat })),
    activeRound: activeRound
      ? { id: activeRound.id, label: activeRound.label, startedAt: activeRound.startedAt.toISOString() }
      : null,
    records,
  };
}

/** QR 스캔/검색한 학생의 상세 정보 (포털 — 토큰+게이트 인증). */
export async function getPatrolStudentInfo(token: string, studentId: string): Promise<PatrolStudentInfo> {
  await requirePatroller(token);

  const s = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true, name: true, grade: true, school: true, seat: true,
      mentoringNotes: true, studentInfo: true, dailyNote: true, dailyNoteDate: true,
    },
  });
  if (!s) throw new Error("학생을 찾을 수 없습니다");

  // 당일 변동 메모는 오늘(KST) 기록만 노출
  const today = todayKST();
  const isToday = s.dailyNoteDate
    ? new Date(s.dailyNoteDate).toISOString().slice(0, 10) === today.toISOString().slice(0, 10)
    : false;

  return {
    id: s.id,
    name: s.name,
    grade: s.grade,
    school: s.school,
    seat: s.seat,
    mentoringNotes: s.mentoringNotes,
    studentInfo: s.studentInfo,
    dailyNote: isToday ? s.dailyNote : null,
  };
}

// ───────────────────── 포털 mutation ─────────────────────

/** 새 순찰 회차 시작. 이미 진행 중 회차가 있으면 그 회차를 반환(중복 방지). */
export async function startPatrolRound(token: string, label?: string) {
  const patroller = await requirePatroller(token);

  const existing = await prisma.patrolRound.findFirst({
    where: { endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (existing) {
    return { id: existing.id, label: existing.label, startedAt: existing.startedAt.toISOString(), reused: true };
  }

  const round = await prisma.patrolRound.create({
    data: {
      label: label?.trim() || null,
      patrollerId: patroller.id,
      patrollerName: patroller.name,
    },
  });
  return { id: round.id, label: round.label, startedAt: round.startedAt.toISOString(), reused: false };
}

/** 순찰 회차 종료. */
export async function endPatrolRound(token: string, roundId: string) {
  await requirePatroller(token);
  await prisma.patrolRound.updateMany({
    where: { id: roundId, endedAt: null },
    data: { endedAt: new Date() },
  });
  return { ok: true };
}

/**
 * 학생 1명 점검 기록. (roundId, studentId) 당 1건 upsert.
 * studentId 는 좌석 QR 스캔 또는 명단 선택에서 옴 → ACTIVE 학생인지 검증.
 */
export async function recordPatrol(
  token: string,
  roundId: string,
  studentId: string,
  status: PatrolStatus,
  note?: string,
): Promise<PatrolRecordView> {
  await requirePatroller(token);

  const round = await prisma.patrolRound.findUnique({ where: { id: roundId }, select: { endedAt: true } });
  if (!round) throw new Error("순찰 회차를 찾을 수 없습니다");
  if (round.endedAt) throw new Error("이미 종료된 회차입니다");

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, status: true, name: true, seat: true },
  });
  if (!student) throw new Error("학생을 찾을 수 없습니다 (QR 확인)");
  if (student.status !== "ACTIVE") throw new Error("재원 중인 학생이 아닙니다");

  const cleanNote = note?.trim() || null;

  const record = await prisma.patrolRecord.upsert({
    where: { roundId_studentId: { roundId, studentId } },
    create: { roundId, studentId, status, note: cleanNote },
    update: { status, note: cleanNote, checkedAt: new Date() },
    select: {
      id: true, studentId: true, status: true, note: true, checkedAt: true,
      student: { select: { name: true, seat: true } },
    },
  });

  return toRecordView(record);
}

// ───────────────────── 대시보드 일괄 확인 (Clerk 인증) ─────────────────────

export type PatrolRoundSummary = {
  id: string;
  label: string | null;
  patrollerName: string | null;
  startedAt: string;
  endedAt: string | null;
  checkedCount: number;
  noteCount: number;
  absentCount: number;
};

/** 특정 날짜(KST)의 순찰 회차 요약 목록. 기본 오늘. */
export async function getPatrolRounds(dateStr?: string): Promise<PatrolRoundSummary[]> {
  const session = await auth();
  requireStaff(session?.user?.role);

  const base = dateStr ? new Date(`${dateStr}T00:00:00+09:00`) : new Date(todayKST());
  const dayStart = new Date(base.getTime());
  const dayEnd = new Date(base.getTime() + 24 * 60 * 60 * 1000);

  const rounds = await prisma.patrolRound.findMany({
    where: { startedAt: { gte: dayStart, lt: dayEnd } },
    orderBy: { startedAt: "desc" },
    select: {
      id: true, label: true, patrollerName: true, startedAt: true, endedAt: true,
      records: { select: { status: true } },
    },
  });

  return rounds.map((r) => ({
    id: r.id,
    label: r.label,
    patrollerName: r.patrollerName,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
    checkedCount: r.records.length,
    noteCount: r.records.filter((x) => x.status === "NOTE").length,
    absentCount: r.records.filter((x) => x.status === "ABSENT").length,
  }));
}

export type PatrolRoundWithRecords = PatrolRoundSummary & {
  patrollerId: string | null;
  records: PatrolRecordView[];
};

/**
 * 특정 날짜(KST)의 회차 + 각 회차 점검 기록을 한 번에 조회.
 * 근무자(순찰자)별 마스터-디테일 화면용. 기본 오늘.
 */
export async function getPatrolDayRoundsWithRecords(dateStr?: string): Promise<PatrolRoundWithRecords[]> {
  const session = await auth();
  requireStaff(session?.user?.role);

  const base = dateStr ? new Date(`${dateStr}T00:00:00+09:00`) : new Date(todayKST());
  const dayStart = new Date(base.getTime());
  const dayEnd = new Date(base.getTime() + 24 * 60 * 60 * 1000);

  const rounds = await prisma.patrolRound.findMany({
    where: { startedAt: { gte: dayStart, lt: dayEnd } },
    orderBy: { startedAt: "desc" },
    select: {
      id: true, label: true, patrollerId: true, patrollerName: true, startedAt: true, endedAt: true,
      records: {
        orderBy: [{ status: "desc" }, { checkedAt: "asc" }],
        select: {
          id: true, studentId: true, status: true, note: true, checkedAt: true,
          student: { select: { name: true, seat: true } },
        },
      },
    },
  });

  return rounds.map((r) => ({
    id: r.id,
    label: r.label,
    patrollerId: r.patrollerId,
    patrollerName: r.patrollerName,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
    checkedCount: r.records.length,
    noteCount: r.records.filter((x) => x.status === "NOTE").length,
    absentCount: r.records.filter((x) => x.status === "ABSENT").length,
    records: r.records.map(toRecordView),
  }));
}

/** 한 회차의 점검 기록 상세 (학생별). */
export async function getPatrolRoundDetail(roundId: string): Promise<PatrolRecordView[]> {
  const session = await auth();
  requireStaff(session?.user?.role);

  const rows = await prisma.patrolRecord.findMany({
    where: { roundId },
    orderBy: [{ status: "desc" }, { checkedAt: "asc" }],
    select: {
      id: true, studentId: true, status: true, note: true, checkedAt: true,
      student: { select: { name: true, seat: true } },
    },
  });
  return rows.map(toRecordView);
}
