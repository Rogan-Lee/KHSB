"use server";

import { revalidatePath } from "next/cache";
import Groq from "groq-sdk";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOnlineStaff } from "@/lib/roles";
import { notifySlack } from "@/lib/slack";
import {
  createMeetEvent,
  updateMeetEvent,
  deleteMeetEvent,
  isGoogleCalendarConfigured,
} from "@/lib/google-calendar";
import { buildMentoringSessionPrompt } from "@/lib/online/mentoring-session-prompt";

const GROQ_MODEL = "llama-3.3-70b-versatile";

// ─────────────────── 헬퍼: 제목 포맷 ───────────────────
// 형식: [YYYY-MM-DD | 호스트 - 학생] (HH:MM) 일일 관리 세션
function formatSessionTitle(opts: {
  scheduledAt: Date;
  hostName: string;
  studentName: string;
}): string {
  const dateLabel = opts.scheduledAt.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).replace(/\.\s*/g, "-").replace(/-$/, ""); // "2026. 04. 26." → "2026-04-26"
  const timeLabel = opts.scheduledAt.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `[${dateLabel} | ${opts.hostName} - ${opts.studentName}] (${timeLabel}) 일일 관리 세션`;
}

// ─────────────────── 1) 세션 예약 ───────────────────
export async function createMentoringSession(params: {
  studentId: string;
  scheduledAt: string; // ISO
  durationMinutes: number;
}) {
  const session = await auth();
  requireOnlineStaff(session?.user?.role);
  const host = session!.user;

  if (params.durationMinutes < 5 || params.durationMinutes > 240) {
    throw new Error("세션 길이는 5~240분 사이여야 합니다");
  }

  const startAt = new Date(params.scheduledAt);
  if (isNaN(startAt.getTime())) throw new Error("일시가 올바르지 않습니다");

  const student = await prisma.student.findUnique({
    where: { id: params.studentId },
    select: {
      id: true,
      name: true,
      grade: true,
      isOnlineManaged: true,
      parentEmail: true,
    },
  });
  if (!student || !student.isOnlineManaged) {
    throw new Error("온라인 관리 학생을 찾을 수 없습니다");
  }

  const title = formatSessionTitle({
    scheduledAt: startAt,
    hostName: host.name,
    studentName: student.name,
  });

  // Google Calendar 이벤트 생성 시도. 실패해도 세션 row 는 만들고 meetUrl 만 비워둠.
  let calendarEventId: string | null = null;
  let meetUrl: string | null = null;
  let calendarHtmlLink: string | null = null;
  let calendarError: string | null = null;

  if (await isGoogleCalendarConfigured()) {
    try {
      const attendees: string[] = [];
      if (host.email) attendees.push(host.email);
      if (student.parentEmail) attendees.push(student.parentEmail);

      const result = await createMeetEvent({
        title,
        description: `${student.name} 학생 1:1 화상 관리 세션\n호스트: ${host.name}\n학원 시스템에서 자동 예약`,
        startAt,
        durationMinutes: params.durationMinutes,
        attendeeEmails: attendees,
      });
      calendarEventId = result.eventId;
      meetUrl = result.meetUrl;
      calendarHtmlLink = result.htmlLink;
    } catch (err) {
      calendarError = err instanceof Error ? err.message : String(err);
      console.error("[mentoring-sessions] Calendar 생성 실패:", err);
    }
  } else {
    calendarError = "Google Calendar 미연동 (Meet 링크 없이 예약)";
  }

  const created = await prisma.mentoringSession.create({
    data: {
      studentId: student.id,
      hostId: host.id,
      title,
      scheduledAt: startAt,
      durationMinutes: params.durationMinutes,
      calendarEventId,
      meetUrl,
      calendarHtmlLink,
    },
  });

  await notifySlack(
    `📞 *${student.name} 화상 세션 예약*\n` +
      `${host.name} · ${startAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · ${params.durationMinutes}분\n` +
      (meetUrl ? `Meet: ${meetUrl}` : `⚠️ Calendar 미생성: ${calendarError ?? "원인 미상"}`)
  );

  revalidatePath("/online/students");
  revalidatePath(`/online/students/${student.id}`);
  return { session: created, calendarError };
}

// ─────────────────── 2) 세션 노트 자동 저장 ───────────────────
export async function updateSessionNotes(params: {
  sessionId: string;
  notes: string;
}) {
  const session = await auth();
  requireOnlineStaff(session?.user?.role);

  const existing = await prisma.mentoringSession.findUnique({
    where: { id: params.sessionId },
    select: { id: true, status: true, hostId: true, studentId: true },
  });
  if (!existing) throw new Error("세션을 찾을 수 없습니다");
  if (existing.status === "CANCELED") {
    throw new Error("취소된 세션은 수정할 수 없습니다");
  }

  await prisma.mentoringSession.update({
    where: { id: params.sessionId },
    data: { notes: params.notes },
  });

  revalidatePath(`/online/students/${existing.studentId}`);
}

// ─────────────────── 3) 종료 + AI 요약 + 일일 보고 적재 ───────────────────
export async function completeMentoringSession(sessionId: string) {
  const session = await auth();
  requireOnlineStaff(session?.user?.role);

  const target = await prisma.mentoringSession.findUnique({
    where: { id: sessionId },
    include: {
      student: { select: { id: true, name: true, grade: true } },
      host: { select: { name: true } },
    },
  });
  if (!target) throw new Error("세션을 찾을 수 없습니다");
  if (target.status === "CANCELED") {
    throw new Error("취소된 세션은 종료 처리할 수 없습니다");
  }
  if (!target.notes || !target.notes.trim()) {
    throw new Error("노트가 비어 있어 요약할 수 없습니다");
  }

  // AI 요약
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const { systemPrompt, userPrompt } = buildMentoringSessionPrompt({
    studentName: target.student.name,
    studentGrade: target.student.grade,
    hostName: target.host.name,
    scheduledAt: target.scheduledAt,
    durationMinutes: target.durationMinutes,
    notes: target.notes,
  });

  const completion = await groq.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    model: GROQ_MODEL,
    temperature: 0.4,
  });
  const summary = completion.choices[0]?.message?.content?.trim();
  if (!summary) throw new Error("AI 요약 생성 실패");

  // 일일 보고에 적재 (해당 날짜 KST). 기존 보고가 있으면 화상 세션 블록을 prepend.
  const sessionDateKst = new Date(target.scheduledAt);
  // KST 기준 날짜만 추출
  const kstYmd = sessionDateKst.toLocaleDateString("en-CA", {
    timeZone: "Asia/Seoul",
  });
  const logDate = new Date(kstYmd + "T00:00:00.000Z");

  const sessionTimeLabel = sessionDateKst.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const blockHeader = `🎥 화상 세션 (${sessionTimeLabel}, ${target.durationMinutes}분, 호스트 ${target.host.name})`;
  const sessionBlock = `${blockHeader}\n\n${summary}`;

  const existingLog = await prisma.dailyKakaoLog.findUnique({
    where: {
      studentId_logDate: { studentId: target.student.id, logDate },
    },
  });

  let upsertedLogId: string;
  if (existingLog) {
    const merged = `${sessionBlock}\n\n---\n\n${existingLog.summary}`;
    const updated = await prisma.dailyKakaoLog.update({
      where: { id: existingLog.id },
      data: {
        summary: merged,
        aiSummarized: true,
      },
    });
    upsertedLogId = updated.id;
  } else {
    const created = await prisma.dailyKakaoLog.create({
      data: {
        studentId: target.student.id,
        logDate,
        summary: sessionBlock,
        tags: [],
        isParentVisible: true,
        aiSummarized: true,
        authorId: session!.user.id,
      },
    });
    upsertedLogId = created.id;
  }

  await prisma.mentoringSession.update({
    where: { id: sessionId },
    data: {
      status: "COMPLETED",
      summary,
      summarizedAt: new Date(),
      syncedToLogId: upsertedLogId,
    },
  });

  revalidatePath(`/online/students/${target.student.id}`);
  revalidatePath("/online/students");
  revalidatePath("/online/daily-log");

  return { summary, logId: upsertedLogId };
}

// ─────────────────── 4) 세션 취소 ───────────────────
export async function cancelMentoringSession(sessionId: string) {
  const session = await auth();
  requireOnlineStaff(session?.user?.role);

  const target = await prisma.mentoringSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      calendarEventId: true,
      studentId: true,
      title: true,
    },
  });
  if (!target) throw new Error("세션을 찾을 수 없습니다");
  if (target.status === "CANCELED") return { ok: true };
  if (target.status === "COMPLETED") {
    throw new Error("이미 종료된 세션은 취소할 수 없습니다");
  }

  if (target.calendarEventId) {
    await deleteMeetEvent(target.calendarEventId);
  }

  await prisma.mentoringSession.update({
    where: { id: sessionId },
    data: {
      status: "CANCELED",
      canceledAt: new Date(),
    },
  });

  revalidatePath(`/online/students/${target.studentId}`);
  revalidatePath("/online/students");
  return { ok: true };
}

// ─────────────────── 5) 세션 재예약 (시각/길이 변경) ───────────────────
export async function rescheduleMentoringSession(params: {
  sessionId: string;
  scheduledAt: string;
  durationMinutes: number;
}) {
  const session = await auth();
  requireOnlineStaff(session?.user?.role);

  const startAt = new Date(params.scheduledAt);
  if (isNaN(startAt.getTime())) throw new Error("일시가 올바르지 않습니다");

  const target = await prisma.mentoringSession.findUnique({
    where: { id: params.sessionId },
    include: {
      student: { select: { name: true } },
      host: { select: { name: true } },
    },
  });
  if (!target) throw new Error("세션을 찾을 수 없습니다");
  if (target.status !== "SCHEDULED") {
    throw new Error("예약 상태인 세션만 재예약할 수 있습니다");
  }

  const newTitle = formatSessionTitle({
    scheduledAt: startAt,
    hostName: target.host.name,
    studentName: target.student.name,
  });

  if (target.calendarEventId) {
    try {
      await updateMeetEvent({
        eventId: target.calendarEventId,
        title: newTitle,
        startAt,
        durationMinutes: params.durationMinutes,
      });
    } catch (err) {
      console.error("[mentoring-sessions] Calendar update 실패:", err);
    }
  }

  await prisma.mentoringSession.update({
    where: { id: params.sessionId },
    data: {
      scheduledAt: startAt,
      durationMinutes: params.durationMinutes,
      title: newTitle,
    },
  });

  revalidatePath(`/online/students/${target.studentId}`);
  return { ok: true };
}
