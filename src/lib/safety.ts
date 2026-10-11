// 신고·차단 핵심 로직 — 모바일 API(src/app/api/mobile/v1/safety)와 어드민 서버 액션이 같이 쓴다.
// 호출 측이 먼저 세션을 검증하고 본인(SafetyActor)을 넘긴다.
//  · 신고: 메시지 또는 사용자. 대상·글은 DB 에서 다시 읽어 접근 권한을 확인하고, 신고 당시 글을 함께 남긴다.
//  · 차단: 차단한 사람의 글은 차단한 쪽에 보이지 않고, 서로 새 메시지를 보낼 수 없다.
//  · 운영진: 어드민 > 신고 관리에서 확인·처리. 접수·차단은 Slack 으로도 알린다.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { ROLE_DISPLAY } from "@/lib/roles";
import { notifySlack } from "@/lib/slack";

export type SafetyActorType = "STUDENT" | "STAFF" | "PARENT";
export type SafetyUserRef = { type: SafetyActorType; id: string };
export type SafetyActor = SafetyUserRef & { name: string };

export const REPORT_REASONS = {
  ABUSE: "욕설·비방·괴롭힘",
  SEXUAL: "성적이거나 불쾌한 내용",
  SPAM: "광고·도배",
  PRIVACY: "개인정보 노출",
  OTHER: "기타",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

export const REPORT_TARGET_LABEL = {
  CHAT_MESSAGE: "1:1 메시지",
  QUESTION_MESSAGE: "질문·답변",
  STAFF_DM_MESSAGE: "직원 메시지",
  USER: "사용자",
} as const;
export type ReportTargetType = keyof typeof REPORT_TARGET_LABEL;

export const REPORT_RESOLUTIONS = {
  REMOVED: "글 삭제",
  WARNED: "경고",
  RESTRICTED: "이용 제한",
  DISMISSED: "문제 없음",
} as const;
export type ReportResolution = keyof typeof REPORT_RESOLUTIONS;

export const SAFETY_ACTOR_LABEL: Record<SafetyActorType, string> = {
  STUDENT: "학생",
  STAFF: "직원",
  PARENT: "학부모",
};

const MAX_DETAIL_LEN = 1000;
const MAX_SNAPSHOT_LEN = 4000;
const DAILY_REPORT_LIMIT = 20;
const MODERATION_PATH = "/moderation";

const keyOf = (user: SafetyUserRef) => `${user.type}:${user.id}`;

// ─── 차단 조회 ───────────────────────────────────────────────────────

/** 내가 차단한 상대의 키(`STAFF:<id>`) 집합 — 목록·스레드에서 글을 가릴 때 쓴다 */
export async function getBlockedKeys(actor: SafetyUserRef): Promise<Set<string>> {
  const rows = await prisma.userBlock.findMany({
    where: { blockerType: actor.type, blockerId: actor.id },
    select: { blockedType: true, blockedId: true },
  });
  return new Set(rows.map((r) => `${r.blockedType}:${r.blockedId}`));
}

export function isBlockedIn(keys: Set<string>, user: SafetyUserRef) {
  return keys.has(keyOf(user));
}

/** 두 사람 사이의 차단 상태 */
export async function getBlockState(me: SafetyUserRef, other: SafetyUserRef) {
  const rows = await prisma.userBlock.findMany({
    where: {
      OR: [
        { blockerType: me.type, blockerId: me.id, blockedType: other.type, blockedId: other.id },
        { blockerType: other.type, blockerId: other.id, blockedType: me.type, blockedId: me.id },
      ],
    },
    select: { blockerType: true, blockerId: true },
  });
  const isMine = (r: (typeof rows)[number]) => r.blockerType === me.type && r.blockerId === me.id;
  return { blockedByMe: rows.some(isMine), blockedByOther: rows.some((r) => !isMine(r)) };
}

/** 새 메시지를 보내기 전에 — 어느 한쪽이라도 차단했으면 막는다 */
export async function assertCanMessage(sender: SafetyUserRef, recipient: SafetyUserRef) {
  const state = await getBlockState(sender, recipient);
  if (state.blockedByMe) {
    throw new MobileApiError("차단한 상대예요. 차단을 풀면 메시지를 보낼 수 있어요", 403);
  }
  if (state.blockedByOther) {
    throw new MobileApiError("상대방이 메시지를 받지 않도록 설정했어요", 403);
  }
}

// ─── 대상 확인 ───────────────────────────────────────────────────────

function staffRoleLabel(role: string | null | undefined) {
  return (role && ROLE_DISPLAY[role]) || "직원";
}

/**
 * 신고·차단할 수 있는 상대인지 확인하고 이름을 붙여 돌려준다.
 *  · 학생 → 직원: 대화방이 있거나 내 질문에 답한 직원만 (모르는 직원 id 로 이름을 캐지 못하게)
 *  · 직원 → 학생·직원: 존재하는 계정이면 가능
 *  · 학부모: 주고받는 대화가 없어 대상이 없다
 */
async function resolveUser(actor: SafetyActor, target: SafetyUserRef) {
  if (actor.type === target.type && actor.id === target.id) {
    throw new MobileApiError("본인은 선택할 수 없어요", 400);
  }
  const notFound = new MobileApiError("상대를 찾을 수 없어요", 404);

  if (actor.type === "STUDENT") {
    if (target.type !== "STAFF") throw notFound;
    const [chat, answer] = await Promise.all([
      prisma.portalChat.findUnique({
        where: { studentId_staffId: { studentId: actor.id, staffId: target.id } },
        select: { id: true },
      }),
      prisma.questionMessage.findFirst({
        where: { senderUserId: target.id, question: { studentId: actor.id } },
        select: { id: true },
      }),
    ]);
    if (!chat && !answer) throw notFound;
  } else if (actor.type !== "STAFF") {
    throw new MobileApiError("이 계정에서는 쓸 수 없는 기능이에요", 403);
  }

  if (target.type === "STAFF") {
    const user = await prisma.user.findFirst({
      where: { id: target.id, role: { not: "STUDENT" } },
      select: { id: true, name: true, role: true },
    });
    if (!user) throw notFound;
    return { type: "STAFF" as const, id: user.id, name: user.name, roleLabel: staffRoleLabel(user.role) };
  }
  if (target.type === "STUDENT") {
    const student = await prisma.student.findUnique({
      where: { id: target.id },
      select: { id: true, name: true },
    });
    if (!student) throw notFound;
    return { type: "STUDENT" as const, id: student.id, name: student.name, roleLabel: "학생" };
  }
  throw notFound;
}

const userRefSchema = z.object({
  userType: z.enum(["STUDENT", "STAFF"], { message: "상대를 확인해 주세요" }),
  userId: z.string().trim().min(1, "상대를 확인해 주세요").max(64),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new MobileApiError(result.error.issues[0]?.message ?? "입력값을 확인해 주세요", 400);
  }
  return result.data;
}

function actorLabel(user: { type: SafetyActorType; name: string }) {
  return `${SAFETY_ACTOR_LABEL[user.type]} ${user.name}`;
}

// ─── 차단 ────────────────────────────────────────────────────────────

/** 내가 차단한 사용자 목록 (최근 차단순) */
export async function listMyBlocks(actor: SafetyUserRef) {
  const rows = await prisma.userBlock.findMany({
    where: { blockerType: actor.type, blockerId: actor.id },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    user: { type: r.blockedType as SafetyActorType, id: r.blockedId, name: r.blockedName },
    createdAt: r.createdAt.toISOString(),
  }));
}

/** 차단 — 이미 차단했으면 그대로 둔다. 그 상대와의 안 읽은 메시지는 읽음 처리(배지가 남지 않게). */
export async function blockUser(actor: SafetyActor, input: unknown) {
  const ref = parse(userRefSchema, input);
  const target = await resolveUser(actor, { type: ref.userType, id: ref.userId });

  const where = {
    blockerType_blockerId_blockedType_blockedId: {
      blockerType: actor.type,
      blockerId: actor.id,
      blockedType: target.type,
      blockedId: target.id,
    },
  };
  const existing = await prisma.userBlock.findUnique({ where, select: { id: true } });
  if (!existing) {
    await prisma.userBlock.upsert({
      where,
      update: {},
      create: {
        blockerType: actor.type,
        blockerId: actor.id,
        blockedType: target.type,
        blockedId: target.id,
        blockedName: target.name,
      },
    });
    await markReadWith(actor, target);
    void notifySlack(
      `🚫 [차단] ${actorLabel(actor)} → ${actorLabel(target)} · 담당 배정을 확인해 주세요 (어드민 > 신고 관리)`,
    );
    revalidatePath(MODERATION_PATH);
  }

  return { ok: true, user: target };
}

export async function unblockUser(actor: SafetyActor, input: unknown) {
  const ref = parse(userRefSchema, input);
  const removed = await prisma.userBlock.deleteMany({
    where: {
      blockerType: actor.type,
      blockerId: actor.id,
      blockedType: ref.userType,
      blockedId: ref.userId,
    },
  });
  if (removed.count > 0) revalidatePath(MODERATION_PATH);
  return { ok: true };
}

async function markReadWith(actor: SafetyUserRef, target: SafetyUserRef) {
  const now = new Date();
  if (actor.type === "STUDENT" && target.type === "STAFF") {
    await prisma.portalChat.updateMany({
      where: { studentId: actor.id, staffId: target.id },
      data: { studentReadAt: now },
    });
  } else if (actor.type === "STAFF" && target.type === "STUDENT") {
    await prisma.portalChat.updateMany({
      where: { staffId: actor.id, studentId: target.id },
      data: { staffReadAt: now },
    });
  } else if (actor.type === "STAFF" && target.type === "STAFF") {
    await prisma.staffThreadMessage.updateMany({
      where: {
        senderId: target.id,
        readAt: null,
        thread: {
          OR: [
            { aUserId: actor.id, bUserId: target.id },
            { aUserId: target.id, bUserId: actor.id },
          ],
        },
      },
      data: { readAt: now },
    });
  }
}

// ─── 신고 ────────────────────────────────────────────────────────────

const reportSchema = z.object({
  targetType: z.enum(["CHAT_MESSAGE", "QUESTION_MESSAGE", "STAFF_DM_MESSAGE", "USER"], {
    message: "신고 대상을 확인해 주세요",
  }),
  targetId: z.string().trim().max(64).nullish(),
  userType: z.enum(["STUDENT", "STAFF"]).nullish(),
  userId: z.string().trim().max(64).nullish(),
  reason: z.enum(["ABUSE", "SEXUAL", "SPAM", "PRIVACY", "OTHER"], {
    message: "신고 사유를 골라 주세요",
  }),
  detail: z
    .string()
    .trim()
    .max(MAX_DETAIL_LEN, `자세한 내용은 ${MAX_DETAIL_LEN}자 이하로 적어 주세요`)
    .nullish(),
});

function snapshotOf(content: string, attachments: unknown) {
  const files = Array.isArray(attachments)
    ? (attachments as { url?: unknown }[]).filter((a) => typeof a?.url === "string")
    : [];
  const lines = [content.trim(), ...files.map((a) => `첨부: ${a.url}`)].filter(Boolean);
  return lines.join("\n").slice(0, MAX_SNAPSHOT_LEN) || null;
}

type ResolvedTarget = {
  targetId: string | null;
  contextId: string | null;
  user: { type: SafetyActorType; id: string; name: string };
  snapshot: string | null;
};

/** 신고 대상 메시지를 다시 읽어 접근 권한·작성자·글을 확정한다 */
async function resolveReportTarget(
  actor: SafetyActor,
  data: z.infer<typeof reportSchema>,
): Promise<ResolvedTarget> {
  const notFound = new MobileApiError("신고할 글을 찾을 수 없어요", 404);
  const own = new MobileApiError("내가 쓴 글은 신고할 수 없어요", 400);

  if (data.targetType === "USER") {
    const ref = parse(userRefSchema, { userType: data.userType, userId: data.userId });
    const user = await resolveUser(actor, { type: ref.userType, id: ref.userId });
    return { targetId: null, contextId: null, user, snapshot: null };
  }

  const targetId = data.targetId;
  if (!targetId) throw notFound;

  if (data.targetType === "CHAT_MESSAGE") {
    const message = await prisma.portalChatMessage.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        senderType: true,
        senderUserId: true,
        content: true,
        attachments: true,
        senderUser: { select: { name: true } },
        chat: {
          select: {
            id: true,
            studentId: true,
            staffId: true,
            student: { select: { name: true } },
            staff: { select: { name: true } },
          },
        },
      },
    });
    if (!message) throw notFound;
    const { chat } = message;
    const inChat =
      (actor.type === "STUDENT" && chat.studentId === actor.id) ||
      (actor.type === "STAFF" && chat.staffId === actor.id);
    if (!inChat) throw notFound;
    if (message.senderType === actor.type) throw own;
    const user =
      message.senderType === "STUDENT"
        ? { type: "STUDENT" as const, id: chat.studentId, name: chat.student.name }
        : {
            type: "STAFF" as const,
            id: message.senderUserId ?? chat.staffId,
            name: message.senderUser?.name ?? chat.staff.name,
          };
    return {
      targetId: message.id,
      contextId: chat.id,
      user,
      snapshot: snapshotOf(message.content, message.attachments),
    };
  }

  if (data.targetType === "QUESTION_MESSAGE") {
    const message = await prisma.questionMessage.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        senderType: true,
        senderUserId: true,
        content: true,
        attachments: true,
        senderUser: { select: { name: true } },
        question: {
          select: { id: true, studentId: true, title: true, student: { select: { name: true } } },
        },
      },
    });
    if (!message) throw notFound;
    const { question } = message;
    if (actor.type === "STUDENT" ? question.studentId !== actor.id : actor.type !== "STAFF") {
      throw notFound;
    }
    if (message.senderType === "STUDENT") {
      if (actor.type === "STUDENT") throw own;
      return {
        targetId: message.id,
        contextId: question.id,
        user: { type: "STUDENT", id: question.studentId, name: question.student.name },
        snapshot: snapshotOf(`[${question.title}] ${message.content}`, message.attachments),
      };
    }
    if (!message.senderUserId) throw notFound;
    if (actor.type === "STAFF" && message.senderUserId === actor.id) throw own;
    return {
      targetId: message.id,
      contextId: question.id,
      user: { type: "STAFF", id: message.senderUserId, name: message.senderUser?.name ?? "멘토" },
      snapshot: snapshotOf(`[${question.title}] ${message.content}`, message.attachments),
    };
  }

  // STAFF_DM_MESSAGE
  if (actor.type !== "STAFF") throw notFound;
  const message = await prisma.staffThreadMessage.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      senderId: true,
      content: true,
      attachments: true,
      thread: { select: { id: true, aUserId: true, bUserId: true } },
    },
  });
  if (!message) throw notFound;
  if (message.thread.aUserId !== actor.id && message.thread.bUserId !== actor.id) throw notFound;
  if (message.senderId === actor.id) throw own;
  const sender = await prisma.user.findUnique({
    where: { id: message.senderId },
    select: { name: true },
  });
  return {
    targetId: message.id,
    contextId: message.thread.id,
    user: { type: "STAFF", id: message.senderId, name: sender?.name ?? "직원" },
    snapshot: snapshotOf(message.content, message.attachments),
  };
}

/** 신고 접수. 같은 글(사용자)을 이미 신고해 처리 대기 중이면 새로 만들지 않는다. */
export async function createReport(actor: SafetyActor, input: unknown) {
  const data = parse(reportSchema, input);
  const target = await resolveReportTarget(actor, data);

  const mine = { reporterType: actor.type, reporterId: actor.id };
  const [duplicate, today] = await Promise.all([
    prisma.contentReport.findFirst({
      where: {
        ...mine,
        status: "OPEN",
        targetType: data.targetType,
        targetId: target.targetId,
        targetUserType: target.user.type,
        targetUserId: target.user.id,
      },
      select: { id: true },
    }),
    prisma.contentReport.count({
      where: { ...mine, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ]);
  if (duplicate) return { ok: true, duplicate: true };
  if (today >= DAILY_REPORT_LIMIT) {
    throw new MobileApiError(
      `신고는 하루 ${DAILY_REPORT_LIMIT}건까지 접수돼요. 급한 일은 독서실로 연락해 주세요`,
      429,
    );
  }

  await prisma.contentReport.create({
    data: {
      ...mine,
      reporterName: actor.name,
      targetType: data.targetType,
      targetId: target.targetId,
      contextId: target.contextId,
      targetUserType: target.user.type,
      targetUserId: target.user.id,
      targetUserName: target.user.name,
      reason: data.reason,
      detail: data.detail || null,
      snapshot: target.snapshot,
    },
  });

  void notifySlack(
    [
      `🚨 [신고] ${actorLabel(actor)} → ${actorLabel(target.user)} · ${REPORT_TARGET_LABEL[data.targetType]} · ${REPORT_REASONS[data.reason]}`,
      target.snapshot ? `"${target.snapshot.slice(0, 200)}"` : null,
      "어드민 > 신고 관리에서 24시간 안에 확인해 주세요",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  revalidatePath(MODERATION_PATH);

  return { ok: true, duplicate: false };
}

// ─── 운영진 처리 (어드민) ────────────────────────────────────────────

export type ContentReportView = {
  id: string;
  reporter: { type: SafetyActorType; id: string; name: string };
  target: { type: SafetyActorType; id: string; name: string };
  targetType: ReportTargetType;
  targetId: string | null;
  contextId: string | null;
  reason: ReportReason;
  detail: string | null;
  snapshot: string | null;
  status: "OPEN" | "RESOLVED";
  resolution: ReportResolution | null;
  resolutionNote: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export async function listContentReports(
  opts: { status?: "OPEN" | "RESOLVED"; take?: number } = {},
): Promise<ContentReportView[]> {
  const rows = await prisma.contentReport.findMany({
    where: opts.status ? { status: opts.status } : undefined,
    // 처리 완료 목록은 최근 처리순
    orderBy: opts.status === "RESOLVED" ? { resolvedAt: "desc" } : { createdAt: "desc" },
    take: Math.min(Math.max(opts.take ?? 100, 1), 300),
  });
  return rows.map((r) => ({
    id: r.id,
    reporter: { type: r.reporterType as SafetyActorType, id: r.reporterId, name: r.reporterName },
    target: { type: r.targetUserType as SafetyActorType, id: r.targetUserId, name: r.targetUserName },
    targetType: r.targetType as ReportTargetType,
    targetId: r.targetId,
    contextId: r.contextId,
    reason: r.reason as ReportReason,
    detail: r.detail,
    snapshot: r.snapshot,
    status: r.status,
    resolution: r.resolution as ReportResolution | null,
    resolutionNote: r.resolutionNote,
    resolvedByName: r.resolvedByName,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export function countOpenReports() {
  return prisma.contentReport.count({ where: { status: "OPEN" } });
}

export type UserBlockView = {
  id: string;
  blocker: { type: SafetyActorType; id: string; name: string };
  blocked: { type: SafetyActorType; id: string; name: string };
  createdAt: string;
};

/** 전체 차단 현황 — 담당 배정을 다시 볼 수 있게 운영진에게 보여 준다 */
export async function listUserBlocks(take = 100): Promise<UserBlockView[]> {
  const rows = await prisma.userBlock.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(take, 1), 300),
  });
  const idsOf = (type: SafetyActorType) => [
    ...new Set(rows.filter((r) => r.blockerType === type).map((r) => r.blockerId)),
  ];
  const [students, staff] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: idsOf("STUDENT") } },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({ where: { id: { in: idsOf("STAFF") } }, select: { id: true, name: true } }),
  ]);
  const names = new Map<string, string>([
    ...students.map((s) => [`STUDENT:${s.id}`, s.name] as const),
    ...staff.map((u) => [`STAFF:${u.id}`, u.name] as const),
  ]);
  return rows.map((r) => ({
    id: r.id,
    blocker: {
      type: r.blockerType as SafetyActorType,
      id: r.blockerId,
      name: names.get(`${r.blockerType}:${r.blockerId}`) ?? "(알 수 없음)",
    },
    blocked: { type: r.blockedType as SafetyActorType, id: r.blockedId, name: r.blockedName },
    createdAt: r.createdAt.toISOString(),
  }));
}

const resolveSchema = z.object({
  reportId: z.string({ message: "신고를 확인해 주세요" }).trim().min(1, "신고를 확인해 주세요"),
  resolution: z.enum(["REMOVED", "WARNED", "RESTRICTED", "DISMISSED"], {
    message: "처리 결과를 골라 주세요",
  }),
  note: z.string().trim().max(1000, "메모는 1000자 이하로 적어 주세요").nullish(),
});

/**
 * 신고 처리. "글 삭제"면 신고된 메시지를 지우고, 같은 글에 대한 다른 대기 신고도 함께 닫는다.
 * 호출 측(서버 액션)이 원장급 권한을 먼저 확인한다.
 */
export async function resolveContentReport(
  resolver: { id: string; name: string },
  input: unknown,
) {
  const data = parse(resolveSchema, input);
  const report = await prisma.contentReport.findUnique({ where: { id: data.reportId } });
  if (!report) throw new MobileApiError("신고를 찾을 수 없습니다", 404);
  if (report.status === "RESOLVED") throw new MobileApiError("이미 처리된 신고입니다", 409);
  if (data.resolution === "REMOVED" && !report.targetId) {
    throw new MobileApiError("사용자 신고는 지울 글이 없습니다", 400);
  }

  const removing = data.resolution === "REMOVED";
  if (removing) {
    const where = { id: report.targetId! };
    if (report.targetType === "CHAT_MESSAGE") await prisma.portalChatMessage.deleteMany({ where });
    else if (report.targetType === "QUESTION_MESSAGE") await prisma.questionMessage.deleteMany({ where });
    else if (report.targetType === "STAFF_DM_MESSAGE") await prisma.staffThreadMessage.deleteMany({ where });
  }

  const resolved = {
    status: "RESOLVED" as const,
    resolution: data.resolution,
    resolutionNote: data.note || null,
    resolvedById: resolver.id,
    resolvedByName: resolver.name,
    resolvedAt: new Date(),
  };
  await prisma.contentReport.updateMany({
    where: removing
      ? { status: "OPEN", targetType: report.targetType, targetId: report.targetId }
      : { id: report.id, status: "OPEN" },
    data: resolved,
  });
  revalidatePath(MODERATION_PATH);

  return { ok: true };
}
