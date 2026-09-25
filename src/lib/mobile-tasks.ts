import { z } from "zod";

import type { Prisma, Role, TaskFeedbackStatus } from "@/generated/prisma";
import { MobileApiError } from "@/lib/mobile-auth";
import { staffCapabilities } from "@/lib/mobile-capabilities";
import { prisma } from "@/lib/prisma";
import { isFullAccess } from "@/lib/roles";
import { notifySlack } from "@/lib/slack";
import { isResponsibleFor } from "@/lib/student-access";
import { assignedToMeWhere } from "@/lib/student-filters";

/** 직원 조회자 — 원장·SA 는 전체, 그 외 직원은 담당 학생만 (웹 /online/performance 와 동일) */
type StaffViewer = { id: string; role: Role | string };

const DAY_MS = 24 * 60 * 60 * 1000;
/** 완료된 수행평가는 최근 45일 것만 목록에 */
const DONE_LOOKBACK_DAYS = 45;

const assignmentSelect = {
  assignedConsultantId: true,
  assignedMentorId: true,
  assignedStaffId: true,
  mentorId: true,
} as const;

function staffStudentWhere(user?: StaffViewer): Prisma.StudentWhereInput {
  return !user || isFullAccess(user.role) ? {} : assignedToMeWhere(user.id);
}

function assertCanViewStudentTasks(
  user: StaffViewer,
  student: {
    assignedConsultantId: string | null;
    assignedMentorId: string | null;
    assignedStaffId: string | null;
    mentorId: string | null;
  },
  message = "담당 학생의 수행평가만 볼 수 있어요",
) {
  if (isFullAccess(user.role)) return;
  if (!isResponsibleFor(student, user.id)) throw new MobileApiError(message, 403);
}

const fileSchema = z.object({
  mimeType: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().min(0).max(50 * 1024 * 1024),
  url: z.string().url().max(2000),
});

const submissionSchema = z.object({
  files: z.array(fileSchema).min(1, "최소 1개 이상의 파일을 첨부하세요").max(5),
  note: z.string().trim().max(2000).optional().nullable(),
});

const feedbackSchema = z.object({
  content: z.string().trim().min(1, "피드백 내용을 입력하세요").max(4000),
  files: z.array(fileSchema).max(5).optional().default([]),
  status: z.enum(["COMMENT", "NEEDS_REVISION", "APPROVED"]),
});

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new MobileApiError(
    result.error.issues[0]?.message ?? "입력값을 확인하세요",
    400,
  );
}

function serializeFiles(value: unknown) {
  return Array.isArray(value)
    ? value.filter((file) => fileSchema.safeParse(file).success)
    : [];
}

function statusLabel(status: string) {
  return {
    OPEN: "진행 전",
    IN_PROGRESS: "진행 중",
    SUBMITTED: "제출 완료",
    NEEDS_REVISION: "수정 필요",
    DONE: "최종 완료",
  }[status] ?? status;
}

export async function getMobileStudentTasks(studentId: string) {
  const tasks = await prisma.performanceTask.findMany({
    where: { studentId },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      _count: { select: { submissions: true } },
      description: true,
      dueDate: true,
      format: true,
      id: true,
      scoreWeight: true,
      status: true,
      subject: true,
      title: true,
    },
  });

  return {
    items: tasks.map((task) => ({
      description: task.description,
      dueDate: task.dueDate.toISOString(),
      format: task.format,
      id: task.id,
      scoreWeight: task.scoreWeight,
      status: task.status,
      statusLabel: statusLabel(task.status),
      subject: task.subject,
      submissionCount: task._count.submissions,
      title: task.title,
    })),
    summary: {
      done: tasks.filter((task) => task.status === "DONE").length,
      needsRevision: tasks.filter((task) => task.status === "NEEDS_REVISION")
        .length,
      open: tasks.filter((task) => task.status !== "DONE").length,
    },
  };
}

export async function getMobileStudentTask(
  studentId: string,
  taskId: string,
) {
  const task = await prisma.performanceTask.findFirst({
    where: { id: taskId, studentId },
    select: {
      description: true,
      dueDate: true,
      format: true,
      id: true,
      scoreWeight: true,
      status: true,
      subject: true,
      submissions: {
        orderBy: { version: "desc" },
        select: {
          feedbacks: {
            orderBy: { createdAt: "asc" },
            select: {
              author: { select: { name: true } },
              content: true,
              createdAt: true,
              files: true,
              id: true,
              readByStudentAt: true,
              status: true,
            },
          },
          files: true,
          id: true,
          note: true,
          submittedAt: true,
          version: true,
        },
      },
      title: true,
    },
  });
  if (!task) throw new MobileApiError("수행평가를 찾을 수 없습니다", 404);

  const unreadIds = task.submissions.flatMap((submission) =>
    submission.feedbacks
      .filter((feedback) => feedback.readByStudentAt === null)
      .map((feedback) => feedback.id),
  );
  if (unreadIds.length > 0) {
    await prisma.taskFeedback.updateMany({
      where: { id: { in: unreadIds } },
      data: { readByStudentAt: new Date() },
    });
  }

  return {
    description: task.description,
    dueDate: task.dueDate.toISOString(),
    format: task.format,
    id: task.id,
    scoreWeight: task.scoreWeight,
    status: task.status,
    statusLabel: statusLabel(task.status),
    subject: task.subject,
    submissions: task.submissions.map((submission) => ({
      feedbacks: submission.feedbacks.map((feedback) => ({
        authorName: feedback.author.name,
        content: feedback.content,
        createdAt: feedback.createdAt.toISOString(),
        files: serializeFiles(feedback.files),
        id: feedback.id,
        status: feedback.status,
      })),
      files: serializeFiles(submission.files),
      id: submission.id,
      note: submission.note,
      submittedAt: submission.submittedAt.toISOString(),
      version: submission.version,
    })),
    title: task.title,
  };
}

export async function submitMobileStudentTask(
  student: { id: string; name: string },
  taskId: string,
  input: unknown,
) {
  const data = parseBody(submissionSchema, input);
  const task = await prisma.performanceTask.findFirst({
    where: { id: taskId, studentId: student.id },
    select: {
      id: true,
      status: true,
      subject: true,
      title: true,
    },
  });
  if (!task) throw new MobileApiError("수행평가를 찾을 수 없습니다", 404);
  if (task.status === "DONE") {
    throw new MobileApiError("완료된 수행평가는 다시 제출할 수 없습니다", 409);
  }

  const latest = await prisma.taskSubmission.findFirst({
    where: { taskId },
    orderBy: { version: "desc" },
    select: {
      _count: { select: { feedbacks: true } },
      id: true,
      version: true,
    },
  });

  let version = latest?.version ?? 1;
  if (!latest) {
    await prisma.taskSubmission.create({
      data: {
        files: data.files,
        note: data.note || null,
        studentId: student.id,
        taskId,
        version,
      },
    });
  } else if (latest._count.feedbacks === 0) {
    await prisma.taskSubmission.update({
      where: { id: latest.id },
      data: {
        files: data.files,
        note: data.note || null,
        submittedAt: new Date(),
      },
    });
  } else {
    version = latest.version + 1;
    await prisma.taskSubmission.create({
      data: {
        files: data.files,
        note: data.note || null,
        studentId: student.id,
        taskId,
        version,
      },
    });
  }

  if (task.status !== "SUBMITTED") {
    await prisma.performanceTask.update({
      where: { id: task.id },
      data: { status: "SUBMITTED" },
    });
  }

  void notifySlack(
    `📱 [수행평가] ${student.name} 학생이 "${task.subject} - ${task.title}"을 제출했습니다 (v${version}).`,
  );
  return { ok: true, version };
}

/**
 * 직원 수행평가 목록. user 를 넘기면 담당 학생으로 스코핑(원장·SA 는 전체).
 * user 없이 부르면 전체(구 호출부 호환) — 새 호출부는 반드시 user 를 넘길 것.
 */
export async function getMobileStaffTasks(
  user?: StaffViewer,
  now = new Date(),
) {
  const doneSince = new Date(now.getTime() - DONE_LOOKBACK_DAYS * DAY_MS);
  const tasks = await prisma.performanceTask.findMany({
    where: {
      student: { status: "ACTIVE", ...staffStudentWhere(user) },
      OR: [{ status: { not: "DONE" } }, { updatedAt: { gte: doneSince } }],
    },
    orderBy: [{ updatedAt: "desc" }, { dueDate: "asc" }],
    take: 300,
    select: {
      _count: { select: { submissions: true } },
      dueDate: true,
      id: true,
      status: true,
      student: { select: { grade: true, id: true, name: true, school: true } },
      subject: true,
      submissions: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          _count: { select: { feedbacks: true } },
          id: true,
          submittedAt: true,
          version: true,
        },
      },
      title: true,
      updatedAt: true,
    },
  });
  const items = tasks.map((task) => {
    const latest = task.submissions[0];
    return {
      dueDate: task.dueDate.toISOString(),
      id: task.id,
      latestSubmission: latest
        ? {
            feedbackCount: latest._count.feedbacks,
            id: latest.id,
            submittedAt: latest.submittedAt.toISOString(),
            version: latest.version,
          }
        : null,
      status: task.status,
      statusLabel: statusLabel(task.status),
      student: task.student,
      subject: task.subject,
      submissionCount: task._count.submissions,
      title: task.title,
      updatedAt: task.updatedAt.toISOString(),
    };
  });
  return {
    items,
    scope: !user || isFullAccess(user.role) ? ("all" as const) : ("assigned" as const),
    canWriteFeedback: user ? staffCapabilities(user.role).writeFeedback : false,
    summary: {
      active: items.filter(
        (item) => item.status === "OPEN" || item.status === "IN_PROGRESS",
      ).length,
      done: items.filter((item) => item.status === "DONE").length,
      needsFeedback: items.filter(
        (item) =>
          item.status === "SUBMITTED" &&
          item.latestSubmission?.feedbackCount === 0,
      ).length,
      needsRevision: items.filter((item) => item.status === "NEEDS_REVISION")
        .length,
      review: items.filter((item) => item.status === "SUBMITTED").length,
    },
  };
}

export async function getMobileStaffTask(user: StaffViewer, taskId: string) {
  const task = await prisma.performanceTask.findUnique({
    where: { id: taskId },
    select: {
      description: true,
      dueDate: true,
      format: true,
      id: true,
      scoreWeight: true,
      status: true,
      student: {
        select: {
          grade: true,
          id: true,
          name: true,
          school: true,
          ...assignmentSelect,
        },
      },
      subject: true,
      submissions: {
        orderBy: { version: "desc" },
        select: {
          feedbacks: {
            orderBy: { createdAt: "asc" },
            select: {
              author: { select: { name: true } },
              content: true,
              createdAt: true,
              files: true,
              id: true,
              status: true,
            },
          },
          files: true,
          id: true,
          note: true,
          submittedAt: true,
          version: true,
        },
      },
      title: true,
    },
  });
  if (!task) throw new MobileApiError("수행평가를 찾을 수 없습니다", 404);
  assertCanViewStudentTasks(user, task.student);

  return {
    canWriteFeedback:
      staffCapabilities(user.role).writeFeedback &&
      task.status !== "DONE" &&
      task.submissions.length > 0,
    description: task.description,
    dueDate: task.dueDate.toISOString(),
    format: task.format,
    id: task.id,
    scoreWeight: task.scoreWeight,
    status: task.status,
    statusLabel: statusLabel(task.status),
    student: {
      grade: task.student.grade,
      id: task.student.id,
      name: task.student.name,
      school: task.student.school,
    },
    subject: task.subject,
    submissions: task.submissions.map((submission) => ({
      feedbacks: submission.feedbacks.map((feedback) => ({
        authorName: feedback.author.name,
        content: feedback.content,
        createdAt: feedback.createdAt.toISOString(),
        files: serializeFiles(feedback.files),
        id: feedback.id,
        status: feedback.status,
      })),
      files: serializeFiles(submission.files),
      id: submission.id,
      note: submission.note,
      submittedAt: submission.submittedAt.toISOString(),
      version: submission.version,
    })),
    title: task.title,
  };
}

export async function createMobileTaskFeedback(
  user: { id: string; role: Role },
  submissionId: string,
  input: unknown,
) {
  // 역할 게이팅은 capability 단일 출처 (src/lib/mobile-capabilities.ts)
  if (!staffCapabilities(user.role).writeFeedback) {
    throw new MobileApiError("수행평가 피드백 권한이 필요합니다", 403);
  }
  const data = parseBody(feedbackSchema, input);
  const submission = await prisma.taskSubmission.findUnique({
    where: { id: submissionId },
    select: {
      files: true,
      id: true,
      task: {
        select: {
          id: true,
          status: true,
          student: { select: assignmentSelect },
          studentId: true,
          submissions: {
            orderBy: { version: "desc" },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!submission) throw new MobileApiError("제출물을 찾을 수 없습니다", 404);
  assertCanViewStudentTasks(
    user,
    submission.task.student,
    "담당 학생의 수행평가에만 피드백을 남길 수 있어요",
  );
  if (submission.task.status === "DONE") {
    throw new MobileApiError("완료된 수행평가에는 피드백을 추가할 수 없습니다", 409);
  }
  if (
    data.status !== "COMMENT" &&
    submission.task.submissions[0]?.id !== submission.id
  ) {
    throw new MobileApiError(
      "최신 제출물에만 수정 요청 또는 승인을 할 수 있습니다",
      409,
    );
  }

  await prisma.taskFeedback.create({
    data: {
      authorId: user.id,
      content: data.content,
      files: data.files,
      status: data.status as TaskFeedbackStatus,
      submissionId,
    },
  });

  if (data.status === "NEEDS_REVISION") {
    await prisma.performanceTask.update({
      where: { id: submission.task.id },
      data: { status: "NEEDS_REVISION" },
    });
  } else if (data.status === "APPROVED") {
    await prisma.taskResult.upsert({
      where: { taskId: submission.task.id },
      update: {
        finalFiles: submission.files as object,
        finalizedAt: new Date(),
      },
      create: {
        finalFiles: submission.files as object,
        finalizedAt: new Date(),
        studentId: submission.task.studentId,
        taskId: submission.task.id,
      },
    });
    await prisma.performanceTask.update({
      where: { id: submission.task.id },
      data: { status: "DONE" },
    });
  }

  return {
    ok: true,
    status: data.status,
    studentId: submission.task.studentId,
    taskId: submission.task.id,
  };
}
