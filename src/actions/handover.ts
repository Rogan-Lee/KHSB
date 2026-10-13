"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { HandoverPriority } from "@/generated/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { STAFF_ROLES, requireStaff, requireAnyStaff, isAnyStaff, isFullAccess } from "@/lib/roles";
import { todayKST } from "@/lib/utils";

// ── 조회 ──────────────────────────────────────────────────────────────────────

// 목록·상세 공용 스칼라 select — monthlyNotesSnapshot(작성 시점 월간 노트 전체 스냅샷, 화면 미사용)·updatedAt 제외.
// 예전엔 include 로 전 컬럼을 가져와 날짜 범위 목록마다 스냅샷 장문이 같이 내려갔다(Supabase egress).
const HANDOVER_SCALARS = {
  id: true,
  date: true,
  content: true,
  priority: true,
  category: true,
  isPinned: true,
  authorId: true,
  authorName: true,
  recipientId: true,
  recipientName: true,
  createdAt: true,
} satisfies Prisma.HandoverSelect;

const READS_SELECT = {
  select: { userId: true, userName: true, readAt: true, confirmedAt: true },
} satisfies Prisma.Handover$readsArgs;

// 인수인계 목록(보드) — 할 일은 화면에 쓰는 필드만, 루틴 체크리스트는 개수·체크 수만 쓰므로 isChecked 만.
const HANDOVER_LIST_SELECT = {
  ...HANDOVER_SCALARS,
  reads: READS_SELECT,
  tasks: {
    orderBy: { order: "asc" },
    select: { id: true, title: true, content: true, assigneeId: true, isCompleted: true, completedAt: true },
  },
  checklist: { orderBy: { order: "asc" }, select: { isChecked: true } },
} satisfies Prisma.HandoverSelect;

export type HandoverListItem = Prisma.HandoverGetPayload<{ select: typeof HANDOVER_LIST_SELECT }>;

export async function getHandovers(options?: { date?: string; limit?: number }) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const where = options?.date ? { date: new Date(options.date) } : undefined;

  return prisma.handover.findMany({
    where,
    select: HANDOVER_LIST_SELECT,
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: options?.limit,
  });
}

/**
 * 홈 대시보드용 최근 인수인계. 할 일은 제목·배정·완료만, 체크리스트는 개수·체크 수(isChecked)만 가져오고,
 * 루틴 칸에 그대로 펼치는 맨 앞 인수인계의 체크리스트만 latestChecklist 로 따로 조회한다(egress 절감).
 */
export async function getRecentHandovers(days = 14) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const since = todayKST();
  since.setDate(since.getDate() - days);

  const handovers = await prisma.handover.findMany({
    where: { date: { gte: since } },
    select: {
      id: true,
      date: true,
      content: true,
      priority: true,
      category: true,
      isPinned: true,
      authorId: true,
      authorName: true,
      createdAt: true,
      reads: READS_SELECT,
      tasks: {
        orderBy: { order: "asc" },
        select: { id: true, title: true, assigneeId: true, isCompleted: true, completedAt: true },
      },
      checklist: { orderBy: { order: "asc" }, select: { isChecked: true } },
    },
    orderBy: [{ date: "desc" }, { isPinned: "desc" }, { createdAt: "desc" }],
  });

  const latestChecklist = handovers[0]
    ? await prisma.handoverChecklist.findMany({
        where: { handoverId: handovers[0].id },
        orderBy: { order: "asc" },
        select: { id: true, templateId: true, title: true, shiftType: true, isChecked: true, order: true },
      })
    : [];

  return { handovers, latestChecklist };
}

/** since 이후 전체 조회 (이전 날짜 피커 경유). 상한 90일. */
export async function getHandoversSince(sinceYMD: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const since = new Date(sinceYMD);
  if (isNaN(since.getTime())) throw new Error("잘못된 날짜");

  // 안전장치: 90일보다 더 이전은 90일로 클램프
  const floor = todayKST();
  floor.setDate(floor.getDate() - 90);
  const effective = since < floor ? floor : since;

  return prisma.handover.findMany({
    where: { date: { gte: effective } },
    select: HANDOVER_LIST_SELECT,
    orderBy: [{ date: "desc" }, { isPinned: "desc" }, { createdAt: "desc" }],
  });
}

/** from ~ to (YYYY-MM-DD) 범위 조회. to 는 해당일 23:59:59 까지 포함. */
export async function getHandoversBetween(fromYMD: string, toYMD: string): Promise<HandoverListItem[]> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const from = new Date(fromYMD);
  const to = new Date(toYMD);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new Error("잘못된 날짜");
  const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59);

  return prisma.handover.findMany({
    where: { date: { gte: from, lte: toEnd } },
    select: HANDOVER_LIST_SELECT,
    orderBy: [{ date: "desc" }, { isPinned: "desc" }, { createdAt: "desc" }],
  });
}

/** 상세·수정 화면용 단건 — 스냅샷만 빼고 화면에 쓰는 필드 전부. */
export async function getHandoverById(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  return prisma.handover.findUnique({
    where: { id },
    select: {
      ...HANDOVER_SCALARS,
      reads: READS_SELECT,
      tasks: {
        orderBy: { order: "asc" },
        select: {
          id: true, title: true, content: true, assigneeId: true, assigneeName: true, order: true, isCompleted: true,
        },
      },
      checklist: {
        orderBy: { order: "asc" },
        select: {
          id: true, templateId: true, title: true, shiftType: true, isChecked: true,
          checkedAt: true, checkedByName: true, order: true,
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        select: { id: true, authorId: true, authorName: true, content: true, createdAt: true },
      },
    },
  });
}

/** 인수인계 댓글 작성 (직원). */
export async function addHandoverComment(handoverId: string, content: string) {
  const session = await auth();
  requireStaff(session?.user?.role);
  const text = content.trim();
  if (!text) throw new Error("댓글 내용을 입력해 주세요");
  if (text.length > 1000) throw new Error("댓글은 1000자 이하로 작성해 주세요");

  await prisma.handoverComment.create({
    data: {
      handoverId,
      authorId: session!.user!.id,
      authorName: session!.user!.name ?? "",
      content: text,
    },
  });
  revalidatePath(`/handover/${handoverId}`);
  return { ok: true };
}

/** 인수인계 댓글 삭제 (작성자 또는 관리자). */
export async function deleteHandoverComment(commentId: string) {
  const session = await auth();
  requireStaff(session?.user?.role);
  const comment = await prisma.handoverComment.findUnique({
    where: { id: commentId },
    select: { authorId: true, handoverId: true },
  });
  if (!comment) throw new Error("댓글을 찾을 수 없습니다");
  if (comment.authorId !== session!.user!.id && !isFullAccess(session?.user?.role)) {
    throw new Error("삭제 권한이 없습니다");
  }
  await prisma.handoverComment.delete({ where: { id: commentId } });
  revalidatePath(`/handover/${comment.handoverId}`);
  return { ok: true };
}

export async function getTodayHandover() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const today = todayKST();

  return prisma.handover.findFirst({
    where: { date: today },
    select: HANDOVER_LIST_SELECT,
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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const today = data.date ? new Date(data.date) : todayKST();

  const handover = await prisma.handover.create({
    data: {
      content: data.content.trim(),
      priority: data.priority ?? "NORMAL",
      category: data.category?.trim() || null,
      isPinned: data.isPinned ?? false,
      date: today,
      authorId: session.user.id,
      authorName: session.user.name ?? "알 수 없음",
      recipientId: data.recipientId || null,
      recipientName: data.recipientName?.trim() || null,
      monthlyNotesSnapshot: data.monthlyNotesSnapshot ?? undefined,
      tasks: {
        create: data.tasks.map((t, i) => ({
          title: t.title.trim(),
          content: t.content?.trim() ?? "",
          assigneeId: t.assigneeId || null,
          assigneeName: t.assigneeName?.trim() || null,
          order: t.order ?? i,
        })),
      },
      checklist: {
        create: data.checklist.map((c, i) => ({
          templateId: c.templateId || null,
          title: c.title,
          shiftType: c.shiftType ?? "ALL",
          isChecked: c.isChecked,
          order: c.order ?? i,
        })),
      },
    },
    // 호출부(작성 폼)는 반환값을 쓰지 않는다 — 스냅샷 포함 전체 행을 돌려받지 않도록 id 만.
    select: { id: true },
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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const existing = await prisma.handover.findUnique({ where: { id }, select: { authorId: true } });
  if (!existing) throw new Error("인수인계를 찾을 수 없습니다");
  if (
    existing.authorId !== session.user.id &&
    session.user.role !== "DIRECTOR" &&
    session.user.role !== "SUPER_ADMIN"
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
    where: { id },
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
            templateId: c.templateId || null,
            title: c.title,
            shiftType: c.shiftType ?? "ALL",
            isChecked: c.isChecked,
            order: c.order ?? i,
          })),
        },
      }),
    },
    // 호출부(작성 폼)는 반환값을 쓰지 않는다 — 스냅샷 포함 전체 행을 돌려받지 않도록 id 만.
    select: { id: true },
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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const existing = await prisma.handover.findUnique({ where: { id }, select: { authorId: true } });
  if (!existing) throw new Error("인수인계를 찾을 수 없습니다");
  if (
    existing.authorId !== session.user.id &&
    session.user.role !== "DIRECTOR" &&
    session.user.role !== "SUPER_ADMIN"
  ) {
    throw new Error("삭제 권한이 없습니다");
  }

  await prisma.handover.delete({ where: { id } });
  revalidatePath("/handover");
  revalidatePath("/");
}

// ── 확인 / 고정 ───────────────────────────────────────────────────────────────

/**
 * 명시적 "확인" 클릭. confirmedAt 을 세팅한다(= 확인완료).
 * 최초 열람(readAt)은 건드리지 않는다 — 이미 열람 기록이 있으면 그 시각을 보존.
 */
export async function markHandoverRead(handoverId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  await prisma.handoverRead.upsert({
    where: { handoverId_userId: { handoverId, userId: session.user.id } },
    create: {
      handoverId,
      userId: session.user.id,
      userName: session.user.name ?? "알 수 없음",
      confirmedAt: new Date(),
    },
    update: { confirmedAt: new Date() },
  });

  revalidatePath("/handover");
  revalidatePath("/");
}

/**
 * 상세 페이지 열람 시 자동 호출(봤음 기록). readAt 만 남기고 confirmedAt 은 건드리지 않는다.
 * 이미 열람 기록이 있으면 최초 열람 시각을 보존하기 위해 아무것도 갱신하지 않는다.
 * revalidatePath 를 호출하지 않으므로 서버 컴포넌트 렌더 중 호출해도 안전.
 */
export async function recordHandoverView(handoverId: string) {
  const session = await auth();
  if (!session?.user || !isAnyStaff(session.user.role)) return;

  await prisma.handoverRead.upsert({
    where: { handoverId_userId: { handoverId, userId: session.user.id } },
    create: {
      handoverId,
      userId: session.user.id,
      userName: session.user.name ?? "알 수 없음",
    },
    update: {}, // 최초 열람 시각·확인 상태 보존
  });
}

export async function toggleHandoverTask(taskId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

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

export async function toggleHandoverChecklist(itemId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const item = await prisma.handoverChecklist.findUnique({
    where: { id: itemId },
    select: { isChecked: true },
  });
  if (!item) throw new Error("체크리스트 항목을 찾을 수 없습니다");

  const nextChecked = !item.isChecked;
  await prisma.handoverChecklist.update({
    where: { id: itemId },
    data: {
      isChecked: nextChecked,
      checkedAt: nextChecked ? new Date() : null,
      checkedById: nextChecked ? session.user.id : null,
      checkedByName: nextChecked ? session.user.name ?? "알 수 없음" : null,
    },
  });

  revalidatePath("/handover");
  revalidatePath("/");
}

export async function togglePin(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const existing = await prisma.handover.findUnique({ where: { id }, select: { isPinned: true } });
  if (!existing) throw new Error("인수인계를 찾을 수 없습니다");

  await prisma.handover.update({ where: { id }, data: { isPinned: !existing.isPinned } });
  revalidatePath("/handover");
}

// ── 스태프 목록 (담당자 지정용) ───────────────────────────────────────────────

export async function getStaffList() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  return prisma.user.findMany({
    // 인수인계 담당자 picker — 퇴사자 제외
    where: { status: "ACTIVE", role: { in: [...STAFF_ROLES] } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}
