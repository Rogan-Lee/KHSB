import { z } from "zod";

import type { Role } from "@/generated/prisma";
import { MobileApiError } from "@/lib/mobile-auth";
import {
  getKstDayContext,
  resolveAttendanceStatus,
} from "@/lib/mobile-data";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";

const questionSchema = z.object({
  content: z.string().trim().min(1, "질문 내용을 입력하세요").max(4000),
  subject: z.string().trim().max(40).optional().nullable(),
  title: z.string().trim().min(1, "질문 제목을 입력하세요").max(120),
});

const messageSchema = z.object({
  content: z.string().trim().min(1, "내용을 입력하세요").max(4000),
});

const attendanceSchema = z.object({
  action: z.enum([
    "CHECK_IN",
    "CHECK_OUT",
    "START_OUTING",
    "RETURN",
    "MARK_ABSENT",
  ]),
});

const mentoringRecordSchema = z.object({
  content: z.string().trim().min(1, "상담 내용을 입력하세요").max(8000),
  improvements: z.string().trim().max(4000).optional().nullable(),
  nextGoals: z.string().trim().max(4000).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  weaknesses: z.string().trim().max(4000).optional().nullable(),
});

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  throw new MobileApiError(
    result.error.issues[0]?.message ?? "입력값을 확인하세요",
    400,
  );
}

function serializeAttachments(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export async function createMobileStudentQuestion(
  student: { grade: string; id: string; name: string },
  input: unknown,
) {
  const data = parseBody(questionSchema, input);
  const now = new Date();
  const question = await prisma.studentQuestion.create({
    data: {
      lastMessageAt: now,
      staffReadAt: null,
      status: "OPEN",
      studentId: student.id,
      studentReadAt: now,
      subject: data.subject || null,
      title: data.title,
      messages: {
        create: {
          attachments: [],
          content: data.content,
          senderType: "STUDENT",
        },
      },
    },
    select: { id: true },
  });

  void notifySlack(
    `📱 [학생 질문] ${student.name}(${student.grade}) · ${data.subject || "과목 미지정"} — "${data.title}"`,
  );

  return question;
}

export async function getMobileStudentQuestionThread(
  studentId: string,
  questionId: string,
) {
  const question = await prisma.studentQuestion.findFirst({
    where: { id: questionId, studentId },
    select: {
      createdAt: true,
      id: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          attachments: true,
          content: true,
          createdAt: true,
          id: true,
          senderType: true,
          senderUser: { select: { name: true } },
        },
      },
      status: true,
      subject: true,
      title: true,
      student: { select: { name: true } },
    },
  });
  if (!question) throw new MobileApiError("질문을 찾을 수 없습니다", 404);

  await prisma.studentQuestion.update({
    where: { id: question.id },
    data: { studentReadAt: new Date() },
  });

  return {
    question: {
      createdAt: question.createdAt.toISOString(),
      id: question.id,
      status: question.status,
      subject: question.subject,
      title: question.title,
    },
    messages: question.messages.map((message) => ({
      attachments: serializeAttachments(message.attachments),
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      id: message.id,
      senderName:
        message.senderType === "STUDENT"
          ? question.student.name
          : message.senderUser?.name ?? "멘토",
      senderType: message.senderType,
    })),
  };
}

export async function addMobileStudentQuestionMessage(
  studentId: string,
  questionId: string,
  input: unknown,
) {
  const data = parseBody(messageSchema, input);
  const question = await prisma.studentQuestion.findFirst({
    where: { id: questionId, studentId },
    select: { id: true, title: true },
  });
  if (!question) throw new MobileApiError("질문을 찾을 수 없습니다", 404);

  const now = new Date();
  await prisma.$transaction([
    prisma.questionMessage.create({
      data: {
        attachments: [],
        content: data.content,
        questionId: question.id,
        senderType: "STUDENT",
      },
    }),
    prisma.studentQuestion.update({
      where: { id: question.id },
      data: {
        lastMessageAt: now,
        staffReadAt: null,
        studentReadAt: now,
        status: "OPEN",
      },
    }),
  ]);

  return { ok: true };
}

export async function getMobileStaffQuestionThread(questionId: string) {
  const question = await prisma.studentQuestion.findUnique({
    where: { id: questionId },
    select: {
      claimedBy: { select: { id: true, name: true } },
      createdAt: true,
      id: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          attachments: true,
          content: true,
          createdAt: true,
          id: true,
          senderType: true,
          senderUser: { select: { name: true } },
        },
      },
      status: true,
      student: {
        select: { grade: true, id: true, name: true, school: true },
      },
      subject: true,
      title: true,
    },
  });
  if (!question) throw new MobileApiError("질문을 찾을 수 없습니다", 404);

  await prisma.studentQuestion.update({
    where: { id: question.id },
    data: { staffReadAt: new Date() },
  });

  return {
    question: {
      claimedBy: question.claimedBy,
      createdAt: question.createdAt.toISOString(),
      id: question.id,
      status: question.status,
      student: question.student,
      subject: question.subject,
      title: question.title,
    },
    messages: question.messages.map((message) => ({
      attachments: serializeAttachments(message.attachments),
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      id: message.id,
      senderName:
        message.senderType === "STUDENT"
          ? question.student.name
          : message.senderUser?.name ?? "멘토",
      senderType: message.senderType,
    })),
  };
}

export async function answerMobileStudentQuestion(
  userId: string,
  questionId: string,
  input: unknown,
) {
  const data = parseBody(messageSchema, input);
  const question = await prisma.studentQuestion.findUnique({
    where: { id: questionId },
    select: { claimedById: true, id: true, status: true },
  });
  if (!question) throw new MobileApiError("질문을 찾을 수 없습니다", 404);

  const now = new Date();
  await prisma.$transaction([
    prisma.questionMessage.create({
      data: {
        attachments: [],
        content: data.content,
        questionId: question.id,
        senderType: "STAFF",
        senderUserId: userId,
      },
    }),
    prisma.studentQuestion.update({
      where: { id: question.id },
      data: {
        ...(question.claimedById
          ? {}
          : { claimedAt: now, claimedById: userId }),
        lastMessageAt: now,
        staffReadAt: now,
        status: "ANSWERED",
        studentReadAt: null,
      },
    }),
  ]);

  return { ok: true };
}

export type MobileAttendanceAction = z.infer<
  typeof attendanceSchema
>["action"];

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export async function updateMobileAttendance(
  studentId: string,
  input: unknown,
  now = new Date(),
) {
  const { action } = parseBody(attendanceSchema, input);
  const context = getKstDayContext(now);
  const student = await prisma.student.findFirst({
    where: { id: studentId, status: "ACTIVE" },
    select: {
      id: true,
      schedules: {
        where: { dayOfWeek: context.dayOfWeek },
        orderBy: { startTime: "asc" },
        take: 1,
        select: { startTime: true },
      },
    },
  });
  if (!student) throw new MobileApiError("학생을 찾을 수 없습니다", 404);

  const record = await prisma.attendanceRecord.findUnique({
    where: {
      studentId_date: { date: context.date, studentId },
    },
    select: {
      checkIn: true,
      checkOut: true,
      outEnd: true,
      outStart: true,
      type: true,
    },
  });
  const currentStatus = resolveAttendanceStatus(record ?? undefined);

  if (action === "CHECK_IN") {
    if (!["미입실", "결석"].includes(currentStatus)) {
      throw new MobileApiError("현재 상태에서는 입실 처리할 수 없습니다", 409);
    }
    const scheduleStart = student.schedules[0]?.startTime;
    const type =
      scheduleStart &&
      timeToMinutes(context.nowTime) > timeToMinutes(scheduleStart)
        ? "TARDY"
        : "NORMAL";

    await prisma.attendanceRecord.upsert({
      where: { studentId_date: { date: context.date, studentId } },
      create: {
        checkIn: now,
        date: context.date,
        studentId,
        type,
      },
      update: {
        checkIn: now,
        checkOut: null,
        outEnd: null,
        outStart: null,
        type,
      },
    });
    return { ok: true };
  }

  if (action === "MARK_ABSENT") {
    if (currentStatus !== "미입실") {
      throw new MobileApiError("미입실 학생만 결석 처리할 수 있습니다", 409);
    }
    await prisma.attendanceRecord.upsert({
      where: { studentId_date: { date: context.date, studentId } },
      create: {
        date: context.date,
        studentId,
        type: "ABSENT",
      },
      update: {
        checkIn: null,
        checkOut: null,
        outEnd: null,
        outStart: null,
        type: "ABSENT",
      },
    });
    return { ok: true };
  }

  if (action === "START_OUTING") {
    if (currentStatus !== "입실") {
      throw new MobileApiError("입실 중인 학생만 외출 처리할 수 있습니다", 409);
    }
    await prisma.attendanceRecord.update({
      where: { studentId_date: { date: context.date, studentId } },
      data: { outEnd: null, outStart: now },
    });
    return { ok: true };
  }

  if (action === "RETURN") {
    if (currentStatus !== "외출") {
      throw new MobileApiError("현재 외출 상태가 아닙니다", 409);
    }
    await prisma.attendanceRecord.update({
      where: { studentId_date: { date: context.date, studentId } },
      data: { outEnd: now },
    });
    return { ok: true };
  }

  if (!["입실", "외출"].includes(currentStatus)) {
    throw new MobileApiError("현재 상태에서는 퇴실 처리할 수 없습니다", 409);
  }

  await prisma.attendanceRecord.update({
    where: { studentId_date: { date: context.date, studentId } },
    data: {
      checkOut: now,
      ...(record?.outStart && !record.outEnd ? { outEnd: now } : {}),
    },
  });
  return { ok: true };
}

function canEditMentoring(
  mentoring: { mentorId: string },
  userId: string,
  role: Role,
) {
  return role !== "MENTOR" || mentoring.mentorId === userId;
}

export async function getMobileMentoringRecord(
  mentoringId: string,
  userId: string,
  role: Role,
) {
  const mentoring = await prisma.mentoring.findUnique({
    where: { id: mentoringId },
    select: {
      content: true,
      id: true,
      improvements: true,
      mentorId: true,
      nextGoals: true,
      notes: true,
      scheduledAt: true,
      scheduledTimeStart: true,
      status: true,
      student: {
        select: {
          grade: true,
          id: true,
          mentoringNotes: true,
          name: true,
          school: true,
        },
      },
      weaknesses: true,
    },
  });
  if (!mentoring) throw new MobileApiError("멘토링을 찾을 수 없습니다", 404);
  if (!canEditMentoring(mentoring, userId, role)) {
    throw new MobileApiError("이 멘토링을 수정할 수 없습니다", 403);
  }

  return {
    content: mentoring.content,
    id: mentoring.id,
    improvements: mentoring.improvements,
    nextGoals: mentoring.nextGoals,
    notes: mentoring.notes,
    scheduledAt: mentoring.scheduledAt.toISOString(),
    scheduledTimeStart: mentoring.scheduledTimeStart,
    status: mentoring.status,
    student: mentoring.student,
    weaknesses: mentoring.weaknesses,
  };
}

export async function completeMobileMentoring(
  mentoringId: string,
  userId: string,
  role: Role,
  input: unknown,
  now = new Date(),
) {
  const data = parseBody(mentoringRecordSchema, input);
  const mentoring = await prisma.mentoring.findUnique({
    where: { id: mentoringId },
    select: {
      id: true,
      mentorId: true,
      scheduledAt: true,
      scheduledTimeStart: true,
      status: true,
    },
  });
  if (!mentoring) throw new MobileApiError("멘토링을 찾을 수 없습니다", 404);
  if (!canEditMentoring(mentoring, userId, role)) {
    throw new MobileApiError("이 멘토링을 수정할 수 없습니다", 403);
  }
  if (mentoring.status === "CANCELLED") {
    throw new MobileApiError("취소된 멘토링은 기록할 수 없습니다", 409);
  }

  const scheduledTime = mentoring.scheduledTimeStart
    ? new Date(
        `${mentoring.scheduledAt.toISOString().slice(0, 10)}T${mentoring.scheduledTimeStart}:00+09:00`,
      )
    : mentoring.scheduledAt;
  if (scheduledTime > now) {
    throw new MobileApiError("예정 시간이 지난 뒤 기록할 수 있습니다", 409);
  }

  const context = getKstDayContext(now);
  await prisma.mentoring.update({
    where: { id: mentoring.id },
    data: {
      actualDate: context.date,
      actualEndTime: context.nowTime,
      actualStartTime: mentoring.scheduledTimeStart ?? context.nowTime,
      content: data.content,
      improvements: data.improvements || null,
      nextGoals: data.nextGoals || null,
      notes: data.notes || null,
      status: "COMPLETED",
      weaknesses: data.weaknesses || null,
    },
  });

  return { ok: true };
}
