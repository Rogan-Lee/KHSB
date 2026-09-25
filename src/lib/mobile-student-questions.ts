// 모바일 학생 질문(Q&A) — 웹 학생 포털 src/actions/student-questions.ts 와 같은 규칙.
//  · 새 질문: 제목 필수, 사진·파일 또는 내용 중 하나 필수 (사진만 올려도 됨)
//  · 추가 메시지: 내용 또는 첨부 필수, 보관된 질문에는 불가, 상태는 바꾸지 않음(웹과 동일)
//  · 목록: 최신 등록순 + 멘토 답변 미확인 수(unread)
//  · 스레드 조회: 미확인 답변이 있을 때만 읽음 처리
// requireMobileStudent 가 신원을 확정한 뒤 호출한다.

import { z } from "zod";

import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";

const MAX_TITLE_LEN = 120;
const MAX_SUBJECT_LEN = 40;
const MAX_CONTENT_LEN = 4000;
const MAX_ATTACHMENTS = 6;

export type QuestionAttachmentView = {
  url: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
};

const attachmentSchema = z.object({
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((url) => url.startsWith("https://"), "첨부 파일 주소가 올바르지 않아요"),
  name: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().min(0),
  mimeType: z.string().trim().min(1).max(120),
});

const attachmentsSchema = z
  .array(attachmentSchema)
  .max(MAX_ATTACHMENTS, `첨부는 ${MAX_ATTACHMENTS}개까지 올릴 수 있어요`)
  .default([]);

const contentSchema = z
  .string()
  .trim()
  .max(MAX_CONTENT_LEN, `내용은 ${MAX_CONTENT_LEN}자 이하로 작성해 주세요`)
  .default("");

const createSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "질문 제목을 입력해 주세요")
    .max(MAX_TITLE_LEN, `제목은 ${MAX_TITLE_LEN}자 이하로 작성해 주세요`),
  subject: z.string().trim().max(MAX_SUBJECT_LEN).nullish(),
  content: contentSchema,
  attachments: attachmentsSchema,
});

const messageSchema = z.object({
  content: contentSchema,
  attachments: attachmentsSchema,
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (result.success) return result.data;
  throw new MobileApiError(result.error.issues[0]?.message ?? "입력값을 확인해 주세요", 400);
}

function toAttachments(value: unknown): QuestionAttachmentView[] {
  return Array.isArray(value) ? (value as QuestionAttachmentView[]) : [];
}

/** 본인 질문 목록 — 최신 등록순 + 미확인 답변 수. 기존 앱 응답 필드(lastMessage 문자열 등)도 유지. */
export async function listMobileStudentQuestions(studentId: string) {
  const questions = await prisma.studentQuestion.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      subject: true,
      status: true,
      studentReadAt: true,
      lastMessageAt: true,
      createdAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { senderType: true, content: true, attachments: true, createdAt: true },
      },
    },
  });

  const unreadCounts = await Promise.all(
    questions.map((q) =>
      prisma.questionMessage.count({
        where: {
          questionId: q.id,
          senderType: "STAFF",
          createdAt: q.studentReadAt ? { gt: q.studentReadAt } : undefined,
        },
      }),
    ),
  );

  return {
    questions: questions.map((q, i) => {
      const last = q.messages[0] ?? null;
      const unread = unreadCounts[i];
      return {
        id: q.id,
        title: q.title,
        subject: q.subject,
        status: q.status,
        createdAt: q.createdAt.toISOString(),
        lastMessageAt: (q.lastMessageAt ?? q.createdAt).toISOString(),
        lastMessage: last?.content ?? "",
        lastSenderType: last?.senderType ?? null,
        hasAttachments: toAttachments(last?.attachments).length > 0,
        hasUnreadAnswer: unread > 0,
        unread,
      };
    }),
  };
}

/** 본인 질문 스레드. 미확인 답변이 있으면 읽음 처리하고 hasUnread=true 로 알려준다(배지 갱신용). */
export async function getMobileStudentQuestion(studentId: string, questionId: string) {
  const question = await prisma.studentQuestion.findFirst({
    where: { id: questionId, studentId },
    select: {
      id: true,
      title: true,
      subject: true,
      status: true,
      createdAt: true,
      studentReadAt: true,
      student: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          senderType: true,
          content: true,
          attachments: true,
          createdAt: true,
          senderUser: { select: { name: true } },
        },
      },
    },
  });
  if (!question) throw new MobileApiError("질문을 찾을 수 없어요", 404);

  const hasUnread = question.messages.some(
    (m) =>
      m.senderType === "STAFF" &&
      (!question.studentReadAt || m.createdAt > question.studentReadAt),
  );
  if (hasUnread) {
    await prisma.studentQuestion.update({
      where: { id: question.id },
      data: { studentReadAt: new Date() },
    });
  }

  return {
    question: {
      id: question.id,
      title: question.title,
      subject: question.subject,
      status: question.status,
      createdAt: question.createdAt.toISOString(),
    },
    hasUnread,
    messages: question.messages.map((m) => ({
      id: m.id,
      senderType: m.senderType,
      senderName:
        m.senderType === "STUDENT" ? question.student.name : m.senderUser?.name ?? "멘토",
      content: m.content,
      attachments: toAttachments(m.attachments),
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** 새 질문 등록 — 첫 메시지(STUDENT)에 내용 + 문제 사진·파일. */
export async function submitMobileStudentQuestion(
  student: { id: string; name: string; grade: string },
  input: unknown,
) {
  const data = parse(createSchema, input);
  if (!data.content && data.attachments.length === 0) {
    throw new MobileApiError("문제 사진이나 질문 내용을 입력해 주세요", 400);
  }
  const subject = data.subject?.trim() || null;

  const now = new Date();
  const question = await prisma.studentQuestion.create({
    data: {
      studentId: student.id,
      title: data.title,
      subject,
      status: "OPEN",
      lastMessageAt: now,
      studentReadAt: now,
      staffReadAt: null,
      messages: {
        create: {
          senderType: "STUDENT",
          content: data.content,
          attachments: data.attachments as unknown as object,
        },
      },
    },
    select: { id: true },
  });

  void notifySlack(
    `📱 [학생 질문] ${student.name}(${student.grade}) · ${subject ?? "과목 미지정"} — "${data.title}"`,
  );

  return { id: question.id };
}

/** 학생 추가 메시지(추가 질문·답글). */
export async function addMobileStudentQuestionReply(
  student: { id: string; name: string },
  questionId: string,
  input: unknown,
) {
  const data = parse(messageSchema, input);
  if (!data.content && data.attachments.length === 0) {
    throw new MobileApiError("내용 또는 사진을 입력해 주세요", 400);
  }

  const question = await prisma.studentQuestion.findFirst({
    where: { id: questionId, studentId: student.id },
    select: { id: true, title: true, status: true },
  });
  if (!question) throw new MobileApiError("질문을 찾을 수 없어요", 404);
  if (question.status === "ARCHIVED") {
    throw new MobileApiError("보관된 질문에는 답글을 남길 수 없어요", 409);
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.questionMessage.create({
      data: {
        questionId: question.id,
        senderType: "STUDENT",
        content: data.content,
        attachments: data.attachments as unknown as object,
      },
    }),
    prisma.studentQuestion.update({
      where: { id: question.id },
      data: { lastMessageAt: now, studentReadAt: now, staffReadAt: null },
    }),
  ]);

  void notifySlack(`📱 [학생 질문 추가] ${student.name} — "${question.title}"`);

  return { ok: true };
}
