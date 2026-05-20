"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { del, put } from "@vercel/blob";
import { z } from "zod";
import { MentoringStatus } from "@/generated/prisma";
import type { MentoringPhotoTag } from "@/generated/prisma";
import { todayKST, nowKSTTimeString } from "@/lib/utils";
import { requireOwnerOrFullAccess, requireStaff } from "@/lib/roles";

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
    select: { id: true },
  });

  revalidatePath("/mentoring");
  return { id: mentoring.id };
}

export async function updateMentoring(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  // 스태프 이상이면 모든 멘토링 수정 가능 (팀 협업)
  requireStaff(session.user.role);

  const raw = Object.fromEntries(formData.entries());

  const explicitStatus = raw.status as MentoringStatus | undefined;
  const hasContent = !!(raw.content as string);
  const autoStatus: MentoringStatus | undefined =
    hasContent && explicitStatus === "SCHEDULED" ? "COMPLETED" : explicitStatus;

  await prisma.mentoring.update({
    where: { id },
    data: {
      scheduledAt: raw.scheduledAt ? new Date(raw.scheduledAt as string) : undefined,
      scheduledTimeStart: "scheduledTimeStart" in raw ? (raw.scheduledTimeStart as string) || null : undefined,
      scheduledTimeEnd: "scheduledTimeEnd" in raw ? (raw.scheduledTimeEnd as string) || null : undefined,
      actualDate: raw.actualDate ? new Date(raw.actualDate as string) : undefined,
      actualStartTime: "actualStartTime" in raw ? (raw.actualStartTime as string) || null : undefined,
      actualEndTime: "actualEndTime" in raw ? (raw.actualEndTime as string) || null : undefined,
      status: autoStatus,
      content: "content" in raw ? (raw.content as string) || null : undefined,
      previousIssues: "previousIssues" in raw ? (raw.previousIssues as string) || null : undefined,
      improvements: "improvements" in raw ? (raw.improvements as string) || null : undefined,
      weaknesses: "weaknesses" in raw ? (raw.weaknesses as string) || null : undefined,
      nextGoals: "nextGoals" in raw ? (raw.nextGoals as string) || null : undefined,
      notes: "notes" in raw ? (raw.notes as string) || null : undefined,
    },
  });

  revalidatePath("/mentoring");
  revalidatePath(`/mentoring/${id}`);
}

export async function getMentorings(
  mentorId?: string,
  options?: { includeCanceled?: boolean },
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const baseWhere =
    session.user.role === "MENTOR" ? { mentorId: session.user.id } :
    mentorId ? { mentorId } : {};

  // 기본은 CANCELLED 제외. includeCanceled=true 일 때만 모두 포함.
  const includeCanceled = options?.includeCanceled === true;
  const where = includeCanceled
    ? baseWhere
    : { ...baseWhere, status: { not: "CANCELLED" as const } };

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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

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
  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const dayOfWeek = date ? new Date(date).getUTCDay() : kstNow.getUTCDay();
  const targetDate = date ? new Date(date) : todayKST();

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
  const nowTime = nowKSTTimeString();
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

  const today = todayKST();

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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.mentorSchedule.delete({ where: { id } });
  revalidatePath("/mentoring/schedule");
}

export async function getMentorWeeklySchedules(mentorId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  return prisma.mentorSchedule.findMany({
    where: { mentorId },
    orderBy: { dayOfWeek: "asc" },
  });
}

export async function getAllMentorSchedulesToday(dayOfWeek: number) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

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

  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const dayOfWeek = kstNow.getUTCDay();
  const targetDate = todayKST();
  const isDirector = session.user.role === "DIRECTOR" || session.user.role === "SUPER_ADMIN";

  // 오늘 근무하는 멘토 스케줄 조회
  const todaySchedules = await prisma.mentorSchedule.findMany({
    where: isDirector ? { dayOfWeek } : { dayOfWeek, mentorId: session.user.id },
    include: { mentor: { select: { id: true, name: true } } },
    orderBy: { timeStart: "asc" },
  });

  if (todaySchedules.length === 0) return [];

  // 현재 재실 중인 학생 조회 (외출 스케줄 포함)
  const nowTime = nowKSTTimeString();
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

  const todayStart = todayKST();

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

  const isDirector = session.user.role === "DIRECTOR" || session.user.role === "SUPER_ADMIN";
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

  requireStaff(session.user.role);

  await prisma.mentoring.delete({ where: { id } });
  revalidatePath("/mentoring");
}

export async function bulkDeleteMentorings(ids: string[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  // DIRECTOR/ADMIN만 일괄 삭제 가능
  requireStaff(session.user.role);

  await prisma.mentoring.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/mentoring");
}

export async function updateMentoringStatus(id: string, status: MentoringStatus) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  requireStaff(session.user.role);

  await prisma.mentoring.update({ where: { id }, data: { status } });
  revalidatePath("/mentoring");
  revalidatePath(`/mentoring/${id}`);
}

export async function updateMentoringNotes(id: string, notes: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  requireStaff(session.user.role);

  const trimmed = notes.trim();
  await prisma.mentoring.update({
    where: { id },
    data: { notes: trimmed.length > 0 ? trimmed : null },
  });
  revalidatePath("/mentoring");
  revalidatePath(`/mentoring/${id}`);
}

export async function quickStartMentoring(studentId: string, mentorId: string): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const isDirector = session.user.role === "DIRECTOR" || session.user.role === "SUPER_ADMIN";
  const isOwnMentor = mentorId === session.user.id;
  if (!isDirector && !isOwnMentor) throw new Error("Unauthorized");

  const mentoring = await prisma.mentoring.create({
    data: { studentId, mentorId, scheduledAt: new Date(), status: "SCHEDULED" },
  });

  revalidatePath("/mentoring");
  return mentoring.id;
}

// ──────────────────────────────────────────────────────
// 멘토링 첨부 사진 (Sprint 5 PR 5.1 오프라인 이식)
// KDA(핵심 자료) / EXTRA(추가 자료) / FREE(자유) 3종 태그.
// 실제 파일 업로드는 /api/upload/mentoring 라우트에서 처리 후
// 반환된 url/mimeType 을 이 액션으로 DB 에 기록한다.
// ──────────────────────────────────────────────────────

export async function attachMentoringPhoto(
  mentoringId: string,
  data: {
    url: string;
    mimeType: string;
    tag: MentoringPhotoTag;
    caption?: string | null;
    thumbnailUrl?: string | null;
  },
) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const target = await prisma.mentoring.findUnique({
    where: { id: mentoringId },
    select: { id: true },
  });
  if (!target) throw new Error("멘토링 기록을 찾을 수 없습니다");

  const created = await prisma.mentoringPhoto.create({
    data: {
      mentoringId,
      url: data.url,
      thumbnailUrl: data.thumbnailUrl ?? null,
      mimeType: data.mimeType,
      tag: data.tag,
      caption: data.caption?.trim() ? data.caption.trim() : null,
      uploadedById: session!.user.id,
    },
  });

  revalidatePath(`/mentoring/${mentoringId}`);
  return created;
}

export async function deleteMentoringPhoto(id: string) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const photo = await prisma.mentoringPhoto.findUnique({ where: { id } });
  if (!photo) throw new Error("사진을 찾을 수 없습니다");

  // Blob 삭제 시도 (실패해도 DB 는 삭제)
  try {
    const urls = [photo.url, photo.thumbnailUrl].filter(Boolean) as string[];
    if (urls.length > 0) {
      await del(urls, { token: process.env.BLOB_READ_WRITE_TOKEN });
    }
  } catch {
    // Blob 삭제 실패는 silent — DB 정리 우선
  }

  await prisma.mentoringPhoto.delete({ where: { id } });

  revalidatePath(`/mentoring/${photo.mentoringId}`);
  return { ok: true };
}

export async function listMentoringPhotos(mentoringId: string) {
  const session = await auth();
  requireStaff(session?.user?.role);

  return prisma.mentoringPhoto.findMany({
    where: { mentoringId },
    orderBy: { uploadedAt: "asc" },
  });
}

// ──────────────────────────────────────────────────────
// 멘토링 양측 서명 (Sprint 5 PR 5.2 오프라인 이식)
// 학생/멘토 서명은 PNG dataURL 로 받아 Vercel Blob 에 PNG 로 저장.
// 양쪽 모두 set 되는 순간 signedAt 도 동기 설정.
// ──────────────────────────────────────────────────────

export async function setMentoringSignature(
  mentoringId: string,
  params: { which: "student" | "mentor"; dataUrl: string },
) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const target = await prisma.mentoring.findUnique({
    where: { id: mentoringId },
    select: {
      id: true,
      studentSignatureUrl: true,
      mentorSignatureUrl: true,
    },
  });
  if (!target) throw new Error("멘토링 기록을 찾을 수 없습니다");

  // dataURL → Buffer
  const match = params.dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) throw new Error("PNG dataURL 형식이 올바르지 않습니다");
  const buffer = Buffer.from(match[1], "base64");
  if (buffer.byteLength === 0) {
    throw new Error("서명 데이터가 비어 있습니다");
  }
  if (buffer.byteLength > 2 * 1024 * 1024) {
    throw new Error("서명 이미지가 너무 큽니다 (최대 2MB)");
  }

  const blobKey = `mentoring/${mentoringId}/signature-${params.which}-${Date.now()}.png`;
  const blob = await put(blobKey, buffer, {
    access: "public",
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
    contentType: "image/png",
  });

  // 기존 서명 URL 있으면 Blob 정리 (best-effort)
  const previousUrl =
    params.which === "student"
      ? target.studentSignatureUrl
      : target.mentorSignatureUrl;
  if (previousUrl) {
    try {
      await del(previousUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch {
      // silent
    }
  }

  const nextStudent =
    params.which === "student" ? blob.url : target.studentSignatureUrl;
  const nextMentor =
    params.which === "mentor" ? blob.url : target.mentorSignatureUrl;
  const bothSigned = !!nextStudent && !!nextMentor;

  const updated = await prisma.mentoring.update({
    where: { id: mentoringId },
    data: {
      studentSignatureUrl: nextStudent,
      mentorSignatureUrl: nextMentor,
      signedAt: bothSigned ? new Date() : null,
    },
    select: {
      studentSignatureUrl: true,
      mentorSignatureUrl: true,
      signedAt: true,
    },
  });

  revalidatePath(`/mentoring/${mentoringId}`);
  return updated;
}

export async function clearMentoringSignature(
  mentoringId: string,
  which: "student" | "mentor",
) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const target = await prisma.mentoring.findUnique({
    where: { id: mentoringId },
    select: {
      id: true,
      studentSignatureUrl: true,
      mentorSignatureUrl: true,
    },
  });
  if (!target) throw new Error("멘토링 기록을 찾을 수 없습니다");

  const previousUrl =
    which === "student" ? target.studentSignatureUrl : target.mentorSignatureUrl;

  if (previousUrl) {
    try {
      await del(previousUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch {
      // silent — Blob 삭제 실패해도 DB 정리는 진행
    }
  }

  const updated = await prisma.mentoring.update({
    where: { id: mentoringId },
    data: {
      ...(which === "student"
        ? { studentSignatureUrl: null }
        : { mentorSignatureUrl: null }),
      signedAt: null, // 한쪽이 비면 signedAt 도 무효
    },
    select: {
      studentSignatureUrl: true,
      mentorSignatureUrl: true,
      signedAt: true,
    },
  });

  revalidatePath(`/mentoring/${mentoringId}`);
  return updated;
}
