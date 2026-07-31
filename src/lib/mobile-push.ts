import { z } from "zod";

import type {
  DevicePlatform,
  PushNotificationCategory,
} from "@/generated/prisma";
import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const EXPO_BATCH_SIZE = 100;
const RECEIPT_BATCH_SIZE = 100;
const EXPO_PUSH_TOKEN = /^(Expo(nent)?PushToken)\[[A-Za-z0-9_-]+\]$/;

const deviceSchema = z.object({
  appVersion: z.string().trim().max(40).optional().nullable(),
  deviceName: z.string().trim().max(120).optional().nullable(),
  enabled: z.boolean(),
  expoPushToken: z
    .string()
    .trim()
    .max(255)
    .regex(EXPO_PUSH_TOKEN, "Expo 푸시 토큰을 확인하세요"),
  platform: z.enum(["IOS", "ANDROID"]),
  preferences: z.object({
    answers: z.boolean(),
    mentoring: z.boolean(),
    tasks: z.boolean(),
  }),
  projectId: z.string().uuid("EAS 프로젝트 ID를 확인하세요"),
});

const deactivateSchema = z.object({
  expoPushToken: z
    .string()
    .trim()
    .max(255)
    .regex(EXPO_PUSH_TOKEN, "Expo 푸시 토큰을 확인하세요"),
});

type PushData = Record<string, boolean | number | string | null>;

type ExpoTicket =
  | { id: string; status: "ok" }
  | {
      details?: { error?: string };
      message?: string;
      status: "error";
    };

type ExpoReceipt =
  | { status: "ok" }
  | {
      details?: { error?: string };
      message?: string;
      status: "error";
    };

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new MobileApiError(
    result.error.issues[0]?.message ?? "입력값을 확인하세요",
    400,
  );
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function categoryFilter(category: PushNotificationCategory) {
  if (category === "TASK") return { tasksEnabled: true };
  if (category === "QUESTION") return { questionsEnabled: true };
  if (category === "MENTORING") return { mentoringEnabled: true };
  return {};
}

function expoHeaders() {
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  return {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function expoRequest(
  url: string,
  body: unknown,
  attempts = 3,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        body: JSON.stringify(body),
        headers: expoHeaders(),
        method: "POST",
        signal: AbortSignal.timeout(8_000),
      });
      if (response.status !== 429 && response.status < 500) return response;
      lastError = new Error(`Expo push service error: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, 400 * 2 ** attempt),
      );
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Expo 푸시 서비스에 연결하지 못했습니다");
}

export async function registerMobilePushToken(
  authUserId: string,
  input: unknown,
) {
  const data = parseBody(deviceSchema, input);
  await prisma.devicePushToken.upsert({
    where: { token: data.expoPushToken },
    create: {
      appVersion: data.appVersion || null,
      authUserId,
      deviceName: data.deviceName || null,
      enabled: data.enabled,
      lastSeenAt: new Date(),
      mentoringEnabled: data.preferences.mentoring,
      platform: data.platform as DevicePlatform,
      projectId: data.projectId,
      questionsEnabled: data.preferences.answers,
      tasksEnabled: data.preferences.tasks,
      token: data.expoPushToken,
    },
    update: {
      appVersion: data.appVersion || null,
      authUserId,
      deviceName: data.deviceName || null,
      enabled: data.enabled,
      lastSeenAt: new Date(),
      mentoringEnabled: data.preferences.mentoring,
      platform: data.platform as DevicePlatform,
      projectId: data.projectId,
      questionsEnabled: data.preferences.answers,
      tasksEnabled: data.preferences.tasks,
    },
  });
  return { ok: true };
}

export async function deactivateMobilePushToken(
  authUserId: string,
  input: unknown,
) {
  const data = parseBody(deactivateSchema, input);
  await prisma.devicePushToken.updateMany({
    where: { authUserId, token: data.expoPushToken },
    data: { enabled: false, lastSeenAt: new Date() },
  });
  return { ok: true };
}

export async function sendMobilePush(input: {
  authUserIds: string[];
  body: string;
  category: PushNotificationCategory;
  data: PushData;
  title: string;
}) {
  const authUserIds = [...new Set(input.authUserIds.filter(Boolean))];
  if (authUserIds.length === 0) return { sent: 0 };

  const tokens = await prisma.devicePushToken.findMany({
    where: {
      authUserId: { in: authUserIds },
      enabled: true,
      ...categoryFilter(input.category),
    },
    select: { id: true, projectId: true, token: true },
  });
  if (tokens.length === 0) return { sent: 0 };

  const byProject = new Map<string, typeof tokens>();
  for (const token of tokens) {
    const group = byProject.get(token.projectId) ?? [];
    group.push(token);
    byProject.set(token.projectId, group);
  }

  let sent = 0;
  for (const projectTokens of byProject.values()) {
    for (const batch of chunks(projectTokens, EXPO_BATCH_SIZE)) {
      const response = await expoRequest(
        EXPO_PUSH_URL,
        batch.map((token) => ({
          body: input.body,
          channelId: "reminders",
          data: input.data,
          priority: "high",
          sound: "default",
          title: input.title,
          to: token.token,
        })),
      );
      if (!response.ok) {
        throw new Error(`Expo 푸시 요청 실패: ${response.status}`);
      }
      const payload = (await response.json()) as {
        data?: ExpoTicket[] | ExpoTicket;
      };
      const tickets = Array.isArray(payload.data)
        ? payload.data
        : payload.data
          ? [payload.data]
          : [];
      const receipts: {
        category: PushNotificationCategory;
        devicePushTokenId: string;
        expoReceiptId: string;
      }[] = [];
      const invalidTokenIds: string[] = [];

      tickets.forEach((ticket, index) => {
        const token = batch[index];
        if (!token) return;
        if (ticket.status === "ok") {
          receipts.push({
            category: input.category,
            devicePushTokenId: token.id,
            expoReceiptId: ticket.id,
          });
          sent += 1;
        } else if (ticket.details?.error === "DeviceNotRegistered") {
          invalidTokenIds.push(token.id);
        }
      });

      await Promise.all([
        receipts.length > 0
          ? prisma.pushNotificationReceipt.createMany({
              data: receipts,
              skipDuplicates: true,
            })
          : Promise.resolve(),
        invalidTokenIds.length > 0
          ? prisma.devicePushToken.updateMany({
              where: { id: { in: invalidTokenIds } },
              data: { enabled: false },
            })
          : Promise.resolve(),
      ]);
    }
  }
  return { sent };
}

async function authUserIdsForAppUsers(appUserIds: (string | null)[]) {
  const ids = [...new Set(appUserIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return [];
  const users = await prisma.authUser.findMany({
    where: { appUserId: { in: ids } },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

async function authUserIdForStudent(studentId: string) {
  const user = await prisma.authUser.findUnique({
    where: { studentId },
    select: { id: true },
  });
  return user?.id ?? null;
}

async function assignedStaffAuthUserIds(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      assignedConsultantId: true,
      assignedMentorId: true,
      assignedStaffId: true,
      mentorId: true,
    },
  });
  if (!student) return [];
  const assignedIds = [
    student.mentorId,
    student.assignedMentorId,
    student.assignedConsultantId,
    student.assignedStaffId,
  ];
  const assignedAuthUserIds = await authUserIdsForAppUsers(assignedIds);
  if (assignedAuthUserIds.length > 0) return assignedAuthUserIds;

  const supervisors = await prisma.user.findMany({
    where: {
      role: { in: ["SUPER_ADMIN", "DIRECTOR", "HEAD_MENTOR"] },
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return authUserIdsForAppUsers(supervisors.map((user) => user.id));
}

async function safelySend(input: Parameters<typeof sendMobilePush>[0]) {
  try {
    return await sendMobilePush(input);
  } catch (error) {
    console.error("[mobile-push]", error);
    return { sent: 0 };
  }
}

export async function notifyAssignedStaffOfQuestion(input: {
  questionId: string;
}) {
  const question = await prisma.studentQuestion.findUnique({
    where: { id: input.questionId },
    select: {
      claimedById: true,
      student: { select: { id: true, name: true } },
      title: true,
    },
  });
  if (!question) return { sent: 0 };
  const authUserIds = [
    ...(await assignedStaffAuthUserIds(question.student.id)),
    ...(await authUserIdsForAppUsers([question.claimedById])),
  ];

  return safelySend({
    authUserIds,
    body: `${question.student.name} 학생이 "${question.title}" 질문을 남겼습니다.`,
    category: "QUESTION",
    data: {
      questionId: input.questionId,
      url: "/(staff)/qna",
    },
    title: "새 학생 질문",
  });
}

export async function notifyStudentOfAnswer(input: {
  questionId: string;
}) {
  const question = await prisma.studentQuestion.findUnique({
    where: { id: input.questionId },
    select: { studentId: true, title: true },
  });
  if (!question) return { sent: 0 };

  const authUserId = await authUserIdForStudent(question.studentId);
  return safelySend({
    authUserIds: authUserId ? [authUserId] : [],
    body: `"${question.title}" 질문에 새 답변이 등록되었습니다.`,
    category: "QUESTION",
    data: {
      questionId: input.questionId,
      url: "/(student)/qna",
    },
    title: "질문 답변 도착",
  });
}

export async function notifyAssignedStaffOfTaskSubmission(input: {
  taskId: string;
  version: number;
}) {
  const task = await prisma.performanceTask.findUnique({
    where: { id: input.taskId },
    select: {
      createdById: true,
      student: { select: { id: true, name: true } },
      title: true,
    },
  });
  if (!task) return { sent: 0 };
  const authUserIds = [
    ...(await assignedStaffAuthUserIds(task.student.id)),
    ...(await authUserIdsForAppUsers([task.createdById])),
  ];

  return safelySend({
    authUserIds,
    body: `${task.student.name} 학생이 "${task.title}"을 제출했습니다. (v${input.version})`,
    category: "TASK",
    data: { taskId: input.taskId, url: "/staff-tasks" },
    title: "수행평가 제출",
  });
}

export async function notifyStudentOfTaskFeedback(input: {
  status: "APPROVED" | "COMMENT" | "NEEDS_REVISION";
  submissionId: string;
}) {
  const submission = await prisma.taskSubmission.findUnique({
    where: { id: input.submissionId },
    select: {
      task: { select: { id: true, studentId: true, title: true } },
    },
  });
  if (!submission) return { sent: 0 };

  const authUserId = await authUserIdForStudent(submission.task.studentId);
  const statusLabel = {
    APPROVED: "승인",
    COMMENT: "새 피드백",
    NEEDS_REVISION: "수정 요청",
  }[input.status];
  return safelySend({
    authUserIds: authUserId ? [authUserId] : [],
    body: `"${submission.task.title}" 수행평가에 ${statusLabel}이 등록되었습니다.`,
    category: "TASK",
    data: { taskId: submission.task.id, url: "/student-tasks" },
    title: "수행평가 피드백",
  });
}

export async function processPendingPushReceipts(now = new Date()) {
  const cutoff = new Date(now.getTime() - 15 * 60 * 1000);
  const pending = await prisma.pushNotificationReceipt.findMany({
    where: { createdAt: { lte: cutoff }, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 1000,
    select: {
      devicePushTokenId: true,
      expoReceiptId: true,
      id: true,
    },
  });
  let delivered = 0;
  let failed = 0;

  for (const batch of chunks(pending, RECEIPT_BATCH_SIZE)) {
    const response = await expoRequest(EXPO_RECEIPTS_URL, {
      ids: batch.map((receipt) => receipt.expoReceiptId),
    });
    if (!response.ok) {
      throw new Error(`Expo 영수증 요청 실패: ${response.status}`);
    }
    const payload = (await response.json()) as {
      data?: Record<string, ExpoReceipt>;
    };
    const updates: Promise<unknown>[] = [];

    for (const receipt of batch) {
      const result = payload.data?.[receipt.expoReceiptId];
      if (!result) continue;
      const errorCode =
        result.status === "error" ? result.details?.error ?? null : null;
      updates.push(
        prisma.pushNotificationReceipt.update({
          where: { id: receipt.id },
          data: {
            checkedAt: now,
            errorCode,
            errorMessage:
              result.status === "error" ? result.message ?? null : null,
            status: result.status === "ok" ? "DELIVERED" : "FAILED",
          },
        }),
      );
      if (result.status === "ok") {
        delivered += 1;
      } else {
        failed += 1;
        if (errorCode === "DeviceNotRegistered") {
          updates.push(
            prisma.devicePushToken.update({
              where: { id: receipt.devicePushTokenId },
              data: { enabled: false },
            }),
          );
        }
      }
    }
    await Promise.all(updates);
  }

  await prisma.pushNotificationReceipt.deleteMany({
    where: {
      status: { in: ["DELIVERED", "FAILED"] },
      updatedAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
    },
  });
  return { checked: delivered + failed, delivered, failed };
}
