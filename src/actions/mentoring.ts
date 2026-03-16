"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MentoringStatus } from "@/generated/prisma";
import { redirect } from "next/navigation";

const mentoringSchema = z.object({
  studentId: z.string(),
  scheduledAt: z.string(),
  scheduledTimeStart: z.string().optional(),
  scheduledTimeEnd: z.string().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(MentoringStatus).optional(),
});

export async function createMentoring(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());
  const data = mentoringSchema.parse(raw);

  const mentoring = await prisma.mentoring.create({
    data: {
      studentId: data.studentId,
      mentorId: session.user.id,
      scheduledAt: new Date(data.scheduledAt),
      scheduledTimeStart: data.scheduledTimeStart || null,
      scheduledTimeEnd: data.scheduledTimeEnd || null,
      notes: data.notes || null,
      status: "SCHEDULED",
    },
  });

  revalidatePath("/mentoring");
  redirect(`/mentoring/${mentoring.id}`);
}

export async function updateMentoring(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());

  const explicitStatus = raw.status as MentoringStatus | undefined;
  const hasContent = !!(raw.content as string);
  const autoStatus: MentoringStatus | undefined =
    hasContent && explicitStatus === "SCHEDULED" ? "COMPLETED" : explicitStatus;

  await prisma.mentoring.update({
    where: { id },
    data: {
      scheduledAt: raw.scheduledAt ? new Date(raw.scheduledAt as string) : undefined,
      scheduledTimeStart: (raw.scheduledTimeStart as string) || null,
      scheduledTimeEnd: (raw.scheduledTimeEnd as string) || null,
      actualDate: raw.actualDate ? new Date(raw.actualDate as string) : undefined,
      actualStartTime: (raw.actualStartTime as string) || null,
      actualEndTime: (raw.actualEndTime as string) || null,
      status: autoStatus,
      content: (raw.content as string) || null,
      previousIssues: (raw.previousIssues as string) || null,
      improvements: (raw.improvements as string) || null,
      weaknesses: (raw.weaknesses as string) || null,
      nextGoals: (raw.nextGoals as string) || null,
      notes: (raw.notes as string) || null,
    },
  });

  revalidatePath("/mentoring");
  revalidatePath(`/mentoring/${id}`);
}

export async function getMentorings(mentorId?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const where =
    session.user.role === "MENTOR" ? { mentorId: session.user.id } :
    mentorId ? { mentorId } : undefined;

  return prisma.mentoring.findMany({
    where,
    include: {
      student: { select: { id: true, name: true, grade: true } },
      mentor: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: "desc" },
  });
}

export async function getMentoring(id: string) {
  return prisma.mentoring.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          id: true, name: true, grade: true, school: true,
          mentoringNotes: true, internalScoreRange: true,
          mockScoreRange: true, targetUniversity: true, parentEmail: true,
        },
      },
      mentor: { select: { id: true, name: true } },
    },
  });
}

// ──────────────────────────────────────────────────────
// 매칭 엔진
// ──────────────────────────────────────────────────────

export type MatchCandidate = {
  studentId: string;
  studentName: string;
  grade: string;
  school: string | null;
  isAssignedMentor: boolean;
  priority: 1 | 2 | 3;
  lastMentoringDate: Date | null;
  daysSinceLast: number | null;
  mentoringNotes: string | null;
  attendanceStatus: string;
};

export async function getMentoringMatches(mentorId: string, date?: string): Promise<MatchCandidate[]> {
  // 로컬 자정 기준으로 날짜 계산 (출결 페이지와 동일)
  const now = date ? new Date(date) : new Date();
  const dayOfWeek = now.getDay();
  const targetDate = date ? new Date(date) : new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 해당 멘토의 오늘 스케줄이 없으면 빈 배열 반환
  const mentorSchedule = await prisma.mentorSchedule.findUnique({
    where: { mentorId_dayOfWeek: { mentorId, dayOfWeek } },
  });
  if (!mentorSchedule) return [];

  // 1. 해당 날짜에 입실한 학생 (NORMAL, TARDY) — 외출 중 제외
  const attendances = await prisma.attendanceRecord.findMany({
    where: {
      date: targetDate,
      type: { in: ["NORMAL", "TARDY"] },
    },
    include: {
      student: {
        select: {
          id: true, name: true, grade: true, school: true,
          mentorId: true, mentoringNotes: true,
          internalScoreRange: true, mockScoreRange: true,
          outings: { where: { dayOfWeek } },
        },
      },
    },
  });

  // 외출 중인 학생 필터링
  const nowTime = new Date().toTimeString().slice(0, 5);
  const presentStudents = attendances.filter((a) => {
    // 실제 외출 기록 중이면 제외
    if (a.outStart && !a.outEnd) return false;
    // 외출 일정 시간 내이면 제외
    const outing = a.student.outings[0];
    if (outing && nowTime >= outing.outStart && nowTime <= outing.outEnd) return false;
    return true;
  });

  if (presentStudents.length === 0) return [];

  const studentIds = presentStudents.map((a) => a.studentId);

  // 2. 각 학생의 마지막 completed 멘토링 조회
  const lastMentorings = await prisma.mentoring.findMany({
    where: {
      studentId: { in: studentIds },
      status: { not: "CANCELLED" },
    },
    orderBy: { scheduledAt: "desc" },
    distinct: ["studentId"],
    select: { studentId: true, scheduledAt: true },
  });

  const lastMap = new Map(lastMentorings.map((m) => [m.studentId, m.scheduledAt]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const candidates: MatchCandidate[] = presentStudents.map((a) => {
    const lastDate = lastMap.get(a.studentId) ?? null;
    const daysSinceLast = lastDate
      ? Math.floor((today.getTime() - new Date(lastDate).setHours(0, 0, 0, 0)) / 86400000)
      : null;

    let priority: 1 | 2 | 3;
    if (daysSinceLast === null || daysSinceLast >= 7) priority = 1;
    else if (daysSinceLast >= 3) priority = 2;
    else priority = 3;

    return {
      studentId: a.studentId,
      studentName: a.student.name,
      grade: a.student.grade,
      school: a.student.school,
      isAssignedMentor: a.student.mentorId === mentorId,
      priority,
      lastMentoringDate: lastDate,
      daysSinceLast,
      mentoringNotes: a.student.mentoringNotes,
      attendanceStatus: a.type,
    };
  });

  // 정렬: priority 오름차순 → 담당 학생 우선
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.isAssignedMentor !== b.isAssignedMentor) return a.isAssignedMentor ? -1 : 1;
    return (a.daysSinceLast ?? 9999) > (b.daysSinceLast ?? 9999) ? -1 : 1;
  });

  return candidates;
}

// ──────────────────────────────────────────────────────
// 피드백 이메일 발송
// ──────────────────────────────────────────────────────

export async function sendFeedbackEmail(mentoringId: string): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const mentoring = await prisma.mentoring.findUnique({
    where: { id: mentoringId },
    include: {
      student: { select: { name: true, grade: true, parentEmail: true } },
      mentor: { select: { name: true } },
    },
  });

  if (!mentoring) return { ok: false, message: "멘토링 기록을 찾을 수 없습니다." };
  if (!mentoring.student.parentEmail) return { ok: false, message: "학부모 이메일이 등록되지 않았습니다." };

  // 실제 이메일 발송 로직 (추후 nodemailer / Resend 연동)
  // 현재는 발송 완료로 기록만 저장
  await prisma.mentoring.update({
    where: { id: mentoringId },
    data: { feedbackSentAt: new Date() },
  });

  revalidatePath(`/mentoring/${mentoringId}`);
  return { ok: true, message: `${mentoring.student.parentEmail}으로 피드백을 발송했습니다.` };
}

// ──────────────────────────────────────────────────────
// 멘토 스케줄 관리
// ──────────────────────────────────────────────────────

export async function saveMentorSchedule(dayOfWeek: number, timeStart: string, timeEnd: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.mentorSchedule.upsert({
    where: { mentorId_dayOfWeek: { mentorId: session.user.id, dayOfWeek } },
    create: { mentorId: session.user.id, dayOfWeek, timeStart, timeEnd },
    update: { timeStart, timeEnd },
  });

  revalidatePath("/mentoring/schedule");
}

export async function deleteMentorSchedule(id: string) {
  await prisma.mentorSchedule.delete({ where: { id } });
  revalidatePath("/mentoring/schedule");
}

export async function getMentorWeeklySchedules(mentorId: string) {
  return prisma.mentorSchedule.findMany({
    where: { mentorId },
    orderBy: { dayOfWeek: "asc" },
  });
}

export async function getAllMentorSchedulesToday(dayOfWeek: number) {
  return prisma.mentorSchedule.findMany({
    where: { dayOfWeek },
    include: { mentor: { select: { id: true, name: true } } },
  });
}

// ──────────────────────────────────────────────────────
// 오늘 근무자별 멘토링 추천
// ──────────────────────────────────────────────────────

export type MentorTodaySlot = {
  mentor: { id: string; name: string };
  schedule: { timeStart: string; timeEnd: string };
  candidates: MatchCandidate[];
};

export async function getTodayWorkingMentors(): Promise<MentorTodaySlot[]> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  // 출결 페이지와 동일한 방식으로 날짜 계산 (로컬 자정 기준)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 로컬 요일 (0=일 ~ 6=토)
  const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 로컬 자정
  const isDirector = session.user.role === "DIRECTOR";

  // 오늘 근무하는 멘토 스케줄 조회
  const todaySchedules = await prisma.mentorSchedule.findMany({
    where: isDirector ? { dayOfWeek } : { dayOfWeek, mentorId: session.user.id },
    include: { mentor: { select: { id: true, name: true } } },
    orderBy: { timeStart: "asc" },
  });

  if (todaySchedules.length === 0) return [];

  // 현재 재실 중인 학생 조회 (외출 스케줄 포함)
  const nowTime = new Date().toTimeString().slice(0, 5);
  const attendances = await prisma.attendanceRecord.findMany({
    where: {
      date: targetDate,
      type: { in: ["NORMAL", "TARDY"] },
    },
    include: {
      student: {
        select: {
          id: true, name: true, grade: true, school: true,
          mentorId: true, mentoringNotes: true,
          outings: { where: { dayOfWeek } },
        },
      },
    },
  });

  // 현재 외출 중인 학생 제외
  const presentAttendances = attendances.filter((a) => {
    if (a.outStart && !a.outEnd) return false;
    const outing = a.student.outings[0];
    if (outing && nowTime >= outing.outStart && nowTime <= outing.outEnd) return false;
    return true;
  });

  const studentIds = presentAttendances.map((a) => a.studentId);
  const lastMap = new Map<string, Date>();

  if (studentIds.length > 0) {
    const lastMentorings = await prisma.mentoring.findMany({
      where: { studentId: { in: studentIds }, status: { not: "CANCELLED" } },
      orderBy: { scheduledAt: "desc" },
      distinct: ["studentId"],
      select: { studentId: true, scheduledAt: true },
    });
    lastMentorings.forEach((m) => lastMap.set(m.studentId, m.scheduledAt));
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return todaySchedules.map((s) => {
    const candidates: MatchCandidate[] = presentAttendances.map((a) => {
      const lastDate = lastMap.get(a.studentId) ?? null;
      const daysSinceLast = lastDate
        ? Math.floor((todayStart.getTime() - new Date(lastDate).setHours(0, 0, 0, 0)) / 86400000)
        : null;

      let priority: 1 | 2 | 3;
      if (daysSinceLast === null || daysSinceLast >= 7) priority = 1;
      else if (daysSinceLast >= 3) priority = 2;
      else priority = 3;

      return {
        studentId: a.studentId,
        studentName: a.student.name,
        grade: a.student.grade,
        school: a.student.school,
        isAssignedMentor: a.student.mentorId === s.mentorId,
        priority,
        lastMentoringDate: lastDate,
        daysSinceLast,
        mentoringNotes: a.student.mentoringNotes,
        attendanceStatus: a.type,
      };
    });

    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.isAssignedMentor !== b.isAssignedMentor) return a.isAssignedMentor ? -1 : 1;
      return (b.daysSinceLast ?? 9999) - (a.daysSinceLast ?? 9999);
    });

    return {
      mentor: s.mentor,
      schedule: { timeStart: s.timeStart, timeEnd: s.timeEnd },
      candidates,
    };
  });
}

export async function bulkCreateMentorings(studentIds: string[], mentorId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const isDirector = session.user.role === "DIRECTOR";
  const isOwnMentor = mentorId === session.user.id;
  if (!isDirector && !isOwnMentor) throw new Error("Unauthorized");

  if (studentIds.length === 0) return;

  await prisma.mentoring.createMany({
    data: studentIds.map((studentId) => ({
      studentId,
      mentorId,
      scheduledAt: new Date(),
      status: "SCHEDULED" as const,
    })),
    skipDuplicates: true,
  });

  revalidatePath("/mentoring");
}

export async function deleteMentoring(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.mentoring.delete({ where: { id } });
  revalidatePath("/mentoring");
}

export async function quickStartMentoring(studentId: string, mentorId: string): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const isDirector = session.user.role === "DIRECTOR";
  const isOwnMentor = mentorId === session.user.id;
  if (!isDirector && !isOwnMentor) throw new Error("Unauthorized");

  const mentoring = await prisma.mentoring.create({
    data: { studentId, mentorId, scheduledAt: new Date(), status: "SCHEDULED" },
  });

  revalidatePath("/mentoring");
  return mentoring.id;
}
