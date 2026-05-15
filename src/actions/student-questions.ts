"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStaff, requireStaff } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { notifySlack } from "@/lib/slack";
import type { StudentQuestionStatus } from "@/generated/prisma/enums";

export type QuestionAttachment = {
  url: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
};

const MAX_TITLE_LEN = 120;
const MAX_SUBJECT_LEN = 40;
const MAX_CONTENT_LEN = 4000;
const MAX_ATTACHMENTS = 6;

function sanitizeAttachments(input: unknown): QuestionAttachment[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (a): a is QuestionAttachment =>
        !!a &&
        typeof a === "object" &&
        typeof (a as { url?: unknown }).url === "string" &&
        ((a as { url: string }).url.startsWith("https://") ||
          (a as { url: string }).url.startsWith("/"))
    )
    .slice(0, MAX_ATTACHMENTS)
    .map((a) => ({
      url: a.url,
      name: typeof a.name === "string" ? a.name.slice(0, 200) : "첨부",
      sizeBytes: typeof a.sizeBytes === "number" ? a.sizeBytes : 0,
      mimeType: typeof a.mimeType === "string" ? a.mimeType : "application/octet-stream",
    }));
}

// ─────────────────────────── 학생 측 (매직링크 토큰 인증) ───────────────────────────

/** 새 질문 등록 — 첫 메시지(STUDENT)에 본문+문제 사진을 담는다. */
export async function createStudentQuestion(params: {
  studentToken: string;
  title: string;
  subject?: string | null;
  content?: string;
  attachments?: QuestionAttachment[];
}) {
  const session = await validateMagicLink(params.studentToken);
  if (!session) throw new Error("인증이 만료되었습니다");

  const title = params.title.trim();
  if (!title) throw new Error("질문 제목을 입력해 주세요");
  if (title.length > MAX_TITLE_LEN) {
    throw new Error(`제목은 ${MAX_TITLE_LEN}자 이하로 작성해 주세요`);
  }
  const subject = (params.subject ?? "").trim().slice(0, MAX_SUBJECT_LEN) || null;
  const content = (params.content ?? "").trim();
  if (content.length > MAX_CONTENT_LEN) {
    throw new Error(`내용은 ${MAX_CONTENT_LEN}자 이하로 작성해 주세요`);
  }
  const attachments = sanitizeAttachments(params.attachments);
  if (!content && attachments.length === 0) {
    throw new Error("문제 사진이나 질문 내용을 입력해 주세요");
  }

  const now = new Date();
  const question = await prisma.studentQuestion.create({
    data: {
      studentId: session.student.id,
      title,
      subject,
      status: "OPEN",
      lastMessageAt: now,
      studentReadAt: now,
      staffReadAt: null,
      messages: {
        create: {
          senderType: "STUDENT",
          content,
          attachments: attachments as unknown as object,
        },
      },
    },
    select: { id: true },
  });

  notifySlack(
    `📷 [학생 질문] ${session.student.name}(${session.student.grade}) · ${subject ?? "과목 미지정"} — "${title}"`
  );

  revalidatePath("/questions");
  return { id: question.id };
}

/** 본인 질문 목록 — 최신순 + 미확인 답변 수. */
export async function listStudentQuestions(params: { studentToken: string }) {
  const session = await validateMagicLink(params.studentToken);
  if (!session) throw new Error("인증이 만료되었습니다");

  const questions = await prisma.studentQuestion.findMany({
    where: { studentId: session.student.id },
    orderBy: { createdAt: "desc" },
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
      })
    )
  );

  return questions.map((q, i) => {
    const last = q.messages[0] ?? null;
    return {
      id: q.id,
      title: q.title,
      subject: q.subject,
      status: q.status,
      createdAt: q.createdAt.toISOString(),
      lastMessageAt: q.lastMessageAt?.toISOString() ?? q.createdAt.toISOString(),
      lastMessage: last
        ? {
            senderType: last.senderType,
            content: last.content,
            hasAttachments:
              Array.isArray(last.attachments) && (last.attachments as unknown[]).length > 0,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
      unread: unreadCounts[i],
    };
  });
}

/** 본인 질문 1건의 스레드 조회. */
export async function getStudentQuestionThread(params: {
  studentToken: string;
  questionId: string;
}) {
  const session = await validateMagicLink(params.studentToken);
  if (!session) throw new Error("인증이 만료되었습니다");

  const question = await prisma.studentQuestion.findUnique({
    where: { id: params.questionId },
    select: {
      id: true,
      studentId: true,
      title: true,
      subject: true,
      status: true,
      createdAt: true,
      studentReadAt: true,
    },
  });
  if (!question || question.studentId !== session.student.id) {
    throw new Error("질문을 찾을 수 없습니다");
  }

  const messages = await prisma.questionMessage.findMany({
    where: { questionId: question.id },
    orderBy: { createdAt: "asc" },
    include: { senderUser: { select: { id: true, name: true } } },
  });

  const hasUnread = messages.some(
    (m) =>
      m.senderType === "STAFF" &&
      (!question.studentReadAt || m.createdAt > question.studentReadAt)
  );

  return {
    question: {
      id: question.id,
      title: question.title,
      subject: question.subject,
      status: question.status,
      createdAt: question.createdAt.toISOString(),
    },
    hasUnread,
    messages: messages.map((m) => ({
      id: m.id,
      senderType: m.senderType,
      senderName: m.senderType === "STUDENT" ? session.student.name : m.senderUser?.name ?? "멘토",
      content: m.content,
      attachments: Array.isArray(m.attachments)
        ? (m.attachments as unknown as QuestionAttachment[])
        : [],
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** 학생이 질문 스레드에 추가 메시지(추가 질문/코멘트) 전송. */
export async function addStudentQuestionMessage(params: {
  studentToken: string;
  questionId: string;
  content?: string;
  attachments?: QuestionAttachment[];
}) {
  const session = await validateMagicLink(params.studentToken);
  if (!session) throw new Error("인증이 만료되었습니다");

  const question = await prisma.studentQuestion.findUnique({
    where: { id: params.questionId },
    select: { id: true, studentId: true, title: true },
  });
  if (!question || question.studentId !== session.student.id) {
    throw new Error("질문을 찾을 수 없습니다");
  }

  const content = (params.content ?? "").trim();
  if (content.length > MAX_CONTENT_LEN) {
    throw new Error(`내용은 ${MAX_CONTENT_LEN}자 이하로 작성해 주세요`);
  }
  const attachments = sanitizeAttachments(params.attachments);
  if (!content && attachments.length === 0) {
    throw new Error("내용 또는 사진을 입력해 주세요");
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.questionMessage.create({
      data: {
        questionId: question.id,
        senderType: "STUDENT",
        content,
        attachments: attachments as unknown as object,
      },
    }),
    prisma.studentQuestion.update({
      where: { id: question.id },
      data: { lastMessageAt: now, studentReadAt: now, staffReadAt: null },
    }),
  ]);

  notifySlack(
    `💬 [학생 질문 추가] ${session.student.name} — "${question.title}"`
  );

  revalidatePath("/questions");
  revalidatePath(`/questions/${question.id}`);
  return { ok: true };
}

/** 학생 측 읽음 처리. */
export async function markStudentQuestionRead(params: {
  studentToken: string;
  questionId: string;
}) {
  const session = await validateMagicLink(params.studentToken);
  if (!session) throw new Error("인증이 만료되었습니다");

  const question = await prisma.studentQuestion.findUnique({
    where: { id: params.questionId },
    select: { id: true, studentId: true },
  });
  if (!question || question.studentId !== session.student.id) {
    throw new Error("질문을 찾을 수 없습니다");
  }

  await prisma.studentQuestion.update({
    where: { id: question.id },
    data: { studentReadAt: new Date() },
  });
  return { ok: true };
}

// ─────────────────────────── 직원 측 (Clerk 세션 + requireStaff) ───────────────────────────

type StaffInboxFilter = "open" | "mine" | "all";

/** 공용 받은함 — 모든 운영진이 본다. */
export async function listStaffQuestionInbox(params?: { filter?: StaffInboxFilter }) {
  const session = await auth();
  requireStaff(session?.user?.role);
  const me = session!.user.id;
  const filter: StaffInboxFilter = params?.filter ?? "open";

  const where =
    filter === "open"
      ? { status: "OPEN" as StudentQuestionStatus }
      : filter === "mine"
        ? { claimedById: me }
        : { status: { not: "ARCHIVED" as StudentQuestionStatus } };

  const questions = await prisma.studentQuestion.findMany({
    where,
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      title: true,
      subject: true,
      status: true,
      staffReadAt: true,
      lastMessageAt: true,
      createdAt: true,
      claimedAt: true,
      student: { select: { id: true, name: true, grade: true, school: true } },
      claimedBy: { select: { id: true, name: true } },
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
          senderType: "STUDENT",
          createdAt: q.staffReadAt ? { gt: q.staffReadAt } : undefined,
        },
      })
    )
  );

  return questions.map((q, i) => {
    const last = q.messages[0] ?? null;
    return {
      id: q.id,
      title: q.title,
      subject: q.subject,
      status: q.status,
      createdAt: q.createdAt.toISOString(),
      lastMessageAt: q.lastMessageAt?.toISOString() ?? q.createdAt.toISOString(),
      student: q.student,
      claimedBy: q.claimedBy,
      claimedByMe: q.claimedBy?.id === me,
      lastMessage: last
        ? {
            senderType: last.senderType,
            content: last.content,
            hasAttachments:
              Array.isArray(last.attachments) && (last.attachments as unknown[]).length > 0,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
      unread: unreadCounts[i],
    };
  });
}

/** 미답변(OPEN) 질문 수 — 사이드바 배지용. */
export async function countOpenStudentQuestions(): Promise<number> {
  const session = await auth();
  if (!session?.user || !isStaff(session.user.role)) return 0;
  return prisma.studentQuestion.count({ where: { status: "OPEN" } });
}

/** 직원이 질문 스레드 조회 — 진입 시 staffReadAt 갱신. */
export async function getStaffQuestionThread(params: { questionId: string }) {
  const session = await auth();
  requireStaff(session?.user?.role);
  const me = session!.user.id;

  const question = await prisma.studentQuestion.findUnique({
    where: { id: params.questionId },
    select: {
      id: true,
      title: true,
      subject: true,
      status: true,
      createdAt: true,
      claimedAt: true,
      student: { select: { id: true, name: true, grade: true, school: true } },
      claimedBy: { select: { id: true, name: true } },
    },
  });
  if (!question) throw new Error("질문을 찾을 수 없습니다");

  const messages = await prisma.questionMessage.findMany({
    where: { questionId: question.id },
    orderBy: { createdAt: "asc" },
    include: { senderUser: { select: { id: true, name: true } } },
  });

  // 직원 읽음 처리 (fire-and-forget)
  prisma.studentQuestion
    .update({ where: { id: question.id }, data: { staffReadAt: new Date() } })
    .catch(() => {});

  return {
    question: {
      id: question.id,
      title: question.title,
      subject: question.subject,
      status: question.status,
      createdAt: question.createdAt.toISOString(),
      student: question.student,
      claimedBy: question.claimedBy,
      claimedByMe: question.claimedBy?.id === me,
      claimedAt: question.claimedAt?.toISOString() ?? null,
    },
    messages: messages.map((m) => ({
      id: m.id,
      senderType: m.senderType,
      senderName: m.senderType === "STUDENT" ? question.student.name : m.senderUser?.name ?? "멘토",
      content: m.content,
      attachments: Array.isArray(m.attachments)
        ? (m.attachments as unknown as QuestionAttachment[])
        : [],
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** 답변 담당 잡기 (soft lock — 이미 다른 사람이 잡았어도 가져올 수 있음). */
export async function claimStudentQuestion(params: { questionId: string }) {
  const session = await auth();
  requireStaff(session?.user?.role);
  const me = session!.user.id;

  const question = await prisma.studentQuestion.findUnique({
    where: { id: params.questionId },
    select: { id: true, claimedBy: { select: { id: true, name: true } } },
  });
  if (!question) throw new Error("질문을 찾을 수 없습니다");
  const previousClaimerName =
    question.claimedBy && question.claimedBy.id !== me ? question.claimedBy.name : null;

  await prisma.studentQuestion.update({
    where: { id: question.id },
    data: { claimedById: me, claimedAt: new Date() },
  });

  revalidatePath("/questions");
  revalidatePath(`/questions/${question.id}`);
  return { ok: true, previousClaimerName };
}

/** 담당 해제. */
export async function releaseStudentQuestion(params: { questionId: string }) {
  const session = await auth();
  requireStaff(session?.user?.role);

  await prisma.studentQuestion.update({
    where: { id: params.questionId },
    data: { claimedById: null, claimedAt: null },
  });

  revalidatePath("/questions");
  revalidatePath(`/questions/${params.questionId}`);
  return { ok: true };
}

/** 멘토 답변(풀이) 등록 — 텍스트 + 풀이 사진. */
export async function answerStudentQuestion(params: {
  questionId: string;
  content?: string;
  attachments?: QuestionAttachment[];
}) {
  const session = await auth();
  requireStaff(session?.user?.role);
  const me = session!.user.id;

  const question = await prisma.studentQuestion.findUnique({
    where: { id: params.questionId },
    select: { id: true, status: true, claimedById: true },
  });
  if (!question) throw new Error("질문을 찾을 수 없습니다");

  const content = (params.content ?? "").trim();
  if (content.length > MAX_CONTENT_LEN) {
    throw new Error(`답변은 ${MAX_CONTENT_LEN}자 이하로 작성해 주세요`);
  }
  const attachments = sanitizeAttachments(params.attachments);
  if (!content && attachments.length === 0) {
    throw new Error("답변 내용이나 풀이 사진을 입력해 주세요");
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.questionMessage.create({
      data: {
        questionId: question.id,
        senderType: "STAFF",
        senderUserId: me,
        content,
        attachments: attachments as unknown as object,
      },
    }),
    prisma.studentQuestion.update({
      where: { id: question.id },
      data: {
        status: question.status === "OPEN" ? "ANSWERED" : question.status,
        lastMessageAt: now,
        staffReadAt: now,
        studentReadAt: null,
        ...(question.claimedById ? {} : { claimedById: me, claimedAt: now }),
      },
    }),
  ]);

  revalidatePath("/questions");
  revalidatePath(`/questions/${question.id}`);
  return { ok: true };
}

/** 질문 상태 변경 (해결됨/보관/다시 열기). */
export async function setStudentQuestionStatus(params: {
  questionId: string;
  status: StudentQuestionStatus;
}) {
  const session = await auth();
  requireStaff(session?.user?.role);

  await prisma.studentQuestion.update({
    where: { id: params.questionId },
    data: { status: params.status },
  });

  revalidatePath("/questions");
  revalidatePath(`/questions/${params.questionId}`);
  return { ok: true };
}
