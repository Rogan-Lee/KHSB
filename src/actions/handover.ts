"use server";

import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { HandoverPriority } from "@/generated/prisma";
import { todayKST } from "@/lib/utils";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

// ── 조회 ──────────────────────────────────────────────────────────────────────

export async function getHandovers(options?: { date?: string; limit?: number }) {
  const session = await getSession();

  const where = options?.date
    ? { orgId: session.orgId, date: new Date(options.date) }
    : { orgId: session.orgId };

  return prisma.handover.findMany({
    where,
    include: {
      reads: { select: { userId: true, userName: true, readAt: true } },
      tasks: { orderBy: { order: "asc" } },
      checklist: { orderBy: { order: "asc" } },
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: options?.limit,
  });
}

export async function getRecentHandovers(days = 14) {
  const session = await getSession();

  const since = todayKST();
  since.setDate(since.getDate() - days);

  return prisma.handover.findMany({
    where: { orgId: session.orgId, date: { gte: since } },
    include: {
      reads: { select: { userId: true, userName: true, readAt: true } },
      tasks: { orderBy: { order: "asc" } },
      checklist: { orderBy: { order: "asc" } },
    },
    orderBy: [{ date: "desc" }, { isPinned: "desc" }, { createdAt: "desc" }],
  });
}

export async function getHandoverById(id: string) {
  const session = await getSession();

  return prisma.handover.findUnique({
    where: { id, orgId: session.orgId },
    include: {
      reads: { select: { userId: true, userName: true, readAt: true } },
      tasks: { orderBy: { order: "asc" } },
      checklist: { orderBy: { order: "asc" } },
    },
  });
}

export async function getTodayHandover() {
  const session = await getSession();

  const today = todayKST();

  return prisma.handover.findFirst({
    where: { orgId: session.orgId, date: today },
    include: {
      reads: { select: { userId: true, userName: true, readAt: true } },
      tasks: { orderBy: { order: "asc" } },
      checklist: { orderBy: { order: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

// ── 생성 ──────────────────────────────────────────────────────────────────────

export type HandoverTaskInput = {
  title: string;
  content?: string;
  assigneeId?: string;
  assigneeName?: string;
  order?: number;
};

export type HandoverChecklistInput = {
  templateId?: string;
  title: string;
  shiftType?: string;
  isChecked: boolean;
  order?: number;
};

export async function createFullHandover(data: {
  content: string;
  tasks: HandoverTaskInput[];
  checklist: HandoverChecklistInput[];
  monthlyNotesSnapshot?: object;
  priority?: HandoverPriority;
  category?: string;
  isPinned?: boolean;
  date?: string;
  recipientId?: string;
  recipientName?: string;
}) {
  const session = await getSession();

  const today = data.date ? new Date(data.date) : todayKST();

  const handover = await prisma.handover.create({
    data: {
      orgId: session.orgId,
      content: data.content.trim(),
      priority: data.priority ?? "NORMAL",
      category: data.category?.trim() || null,
      isPinned: data.isPinned ?? false,
      date: today,
      authorId: session.id,
      authorName: session.name ?? "알 수 없음",
      recipientId: data.recipientId || null,
      recipientName: data.recipientName?.trim() || null,
      monthlyNotesSnapshot: data.monthlyNotesSnapshot ?? undefined,
      tasks: {
        create: data.tasks.map((t, i) => ({
          orgId: session.orgId,
          title: t.title.trim(),
          content: t.content?.trim() ?? "",
          assigneeId: t.assigneeId || null,
          assigneeName: t.assigneeName?.trim() || null,
          order: t.order ?? i,
        })),
      },
      checklist: {
        create: data.checklist.map((c, i) => ({
          orgId: session.orgId,
          templateId: c.templateId || null,
          title: c.title,
          shiftType: c.shiftType ?? "ALL",
          isChecked: c.isChecked,
          order: c.order ?? i,
        })),
      },
    },
    include: {
      reads: { select: { userId: true, userName: true, readAt: true } },
      tasks: { orderBy: { order: "asc" } },
      checklist: { orderBy: { order: "asc" } },
    },
  });

  revalidatePath("/handover");
  revalidatePath("/");
  return handover;
}

// ── 수정 ──────────────────────────────────────────────────────────────────────

export async function updateFullHandover(
  id: string,
  data: {
    content?: string;
    tasks?: HandoverTaskInput[];
    checklist?: HandoverChecklistInput[];
    monthlyNotesSnapshot?: object;
    priority?: HandoverPriority;
    category?: string;
    isPinned?: boolean;
    recipientId?: string | null;
    recipientName?: string | null;
  }
) {
  const session = await getSession();

  const existing = await prisma.handover.findUnique({ where: { id, orgId: session.orgId } });
  if (!existing) throw new Error("인수인계를 찾을 수 없습니다");
  if (
    existing.authorId !== session.id &&
    session.role !== "DIRECTOR" &&
    session.role !== "ADMIN"
  ) {
    throw new Error("수정 권한이 없습니다");
  }

  // tasks/checklist 전체 교체
  if (data.tasks !== undefined) {
    await prisma.handoverTask.deleteMany({ where: { handoverId: id } });
  }
  if (data.checklist !== undefined) {
    await prisma.handoverChecklist.deleteMany({ where: { handoverId: id } });
  }

  const handover = await prisma.handover.update({
    where: { id, orgId: session.orgId },
    data: {
      ...(data.content !== undefined && { content: data.content.trim() }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.category !== undefined && { category: data.category?.trim() || null }),
      ...(data.isPinned !== undefined && { isPinned: data.isPinned }),
      ...(data.recipientId !== undefined && { recipientId: data.recipientId || null }),
      ...(data.recipientName !== undefined && { recipientName: data.recipientName?.trim() || null }),
      ...(data.monthlyNotesSnapshot !== undefined && { monthlyNotesSnapshot: data.monthlyNotesSnapshot }),
      ...(data.tasks !== undefined && {
        tasks: {
          create: data.tasks.map((t, i) => ({
            orgId: session.orgId,
            title: t.title.trim(),
            content: t.content?.trim() ?? "",
            assigneeId: t.assigneeId || null,
            assigneeName: t.assigneeName?.trim() || null,
            order: t.order ?? i,
          })),
        },
      }),
      ...(data.checklist !== undefined && {
        checklist: {
          create: data.checklist.map((c, i) => ({
            orgId: session.orgId,
            templateId: c.templateId || null,
            title: c.title,
            shiftType: c.shiftType ?? "ALL",
            isChecked: c.isChecked,
            order: c.order ?? i,
          })),
        },
      }),
    },
    include: {
      reads: { select: { userId: true, userName: true, readAt: true } },
      tasks: { orderBy: { order: "asc" } },
      checklist: { orderBy: { order: "asc" } },
    },
  });

  revalidatePath("/handover");
  revalidatePath("/");
  return handover;
}

// ── 기존 단순 인수인계 (하위 호환) ───────────────────────────────────────────

export async function createHandover(data: {
  content: string;
  priority?: HandoverPriority;
  category?: string;
  isPinned?: boolean;
  date?: string;
}) {
  return createFullHandover({ ...data, tasks: [], checklist: [] });
}

export async function updateHandover(
  id: string,
  data: { content?: string; priority?: HandoverPriority; category?: string; isPinned?: boolean }
) {
  return updateFullHandover(id, data);
}

// ── 삭제 ──────────────────────────────────────────────────────────────────────

export async function deleteHandover(id: string) {
  const session = await getSession();

  const existing = await prisma.handover.findUnique({ where: { id, orgId: session.orgId } });
  if (!existing) throw new Error("인수인계를 찾을 수 없습니다");
  if (
    existing.authorId !== session.id &&
    session.role !== "DIRECTOR" &&
    session.role !== "ADMIN"
  ) {
    throw new Error("삭제 권한이 없습니다");
  }

  await prisma.handover.delete({ where: { id, orgId: session.orgId } });
  revalidatePath("/handover");
  revalidatePath("/");
}

// ── 확인 / 고정 ───────────────────────────────────────────────────────────────

export async function markHandoverRead(handoverId: string) {
  const session = await getSession();

  await prisma.handoverRead.upsert({
    where: { handoverId_userId: { handoverId, userId: session.id } },
    create: {
      orgId: session.orgId,
      handoverId,
      userId: session.id,
      userName: session.name ?? "알 수 없음",
    },
    update: { readAt: new Date() },
  });

  revalidatePath("/handover");
  revalidatePath("/");
}

export async function toggleHandoverTask(taskId: string) {
  await getSession();

  const task = await prisma.handoverTask.findUnique({ where: { id: taskId }, select: { isCompleted: true } });
  if (!task) throw new Error("할 일을 찾을 수 없습니다");

  await prisma.handoverTask.update({
    where: { id: taskId },
    data: {
      isCompleted: !task.isCompleted,
      completedAt: !task.isCompleted ? new Date() : null,
    },
  });

  revalidatePath("/handover");
  revalidatePath("/");
}

export async function togglePin(id: string) {
  const session = await getSession();

  const existing = await prisma.handover.findUnique({ where: { id, orgId: session.orgId }, select: { isPinned: true } });
  if (!existing) throw new Error("인수인계를 찾을 수 없습니다");

  await prisma.handover.update({ where: { id, orgId: session.orgId }, data: { isPinned: !existing.isPinned } });
  revalidatePath("/handover");
}

// ── 스태프 목록 (담당자 지정용) ───────────────────────────────────────────────

export async function getStaffList() {
  const session = await getSession();

  return prisma.user.findMany({
    where: {
      role: { in: ["ADMIN", "DIRECTOR", "MENTOR", "STAFF"] },
      memberships: { some: { orgId: session.orgId } },
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}
