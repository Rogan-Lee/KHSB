"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isStaff, isFullAccess } from "@/lib/roles";

export type TodoRoleFilter = "MENTOR" | "STAFF" | "ALL";

export async function getTodos(options?: { roleFilter?: TodoRoleFilter }) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  // STAFF 이상은 전체 투두 조회, 그 외는 본인 것만
  const baseWhere = isStaff(session.user.role)
    ? {}
    : {
        OR: [
          { authorId: session.user.id },
          { assigneeId: session.user.id },
        ],
      };

  // targetRole 필터:
  //  - ALL/null/undefined → 모든 행 (null=legacy)
  //  - MENTOR → targetRole IN ("MENTOR", "ALL") 또는 null
  //  - STAFF  → targetRole IN ("STAFF", "ALL") 또는 null
  const role = options?.roleFilter;
  const roleWhere =
    role === "MENTOR"
      ? { OR: [{ targetRole: "MENTOR" }, { targetRole: "ALL" }, { targetRole: null }] }
      : role === "STAFF"
      ? { OR: [{ targetRole: "STAFF" }, { targetRole: "ALL" }, { targetRole: null }] }
      : undefined;

  const where = roleWhere ? { AND: [baseWhere, roleWhere] } : baseWhere;

  // 정렬 순서:
  //   1) category === "루틴" 인 행을 최상단으로 핀 (Sprint 6 PR 6.2)
  //   2) 미완료 → 완료
  //   3) 우선순위: URGENT > HIGH > NORMAL > LOW
  //   4) 기한 빠른 순 (null 은 뒤로)
  //   5) 최근 등록 순
  // Prisma 의 orderBy 만으로 (a) 문자열 필드 정확 매칭 (b) priority enum 순서를
  // 동시에 표현할 수 없어, 안정 정렬 가능한 컬럼들로만 DB 정렬을 받은 뒤
  // 메모리에서 (1)·(3) 키로 stable re-sort 한다. 운영 규모(수백 행) 내 OK.
  const rows = await prisma.todo.findMany({
    where,
    orderBy: [
      { isCompleted: "asc" },
      { dueDate: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ],
  });

  const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
  return rows.sort((a, b) => {
    // 1) 루틴 핀
    const ar = a.category === "루틴" ? 0 : 1;
    const br = b.category === "루틴" ? 0 : 1;
    if (ar !== br) return ar - br;
    // 2) 미완료 우선
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    // 3) 우선순위
    const ap = PRIORITY_RANK[a.priority] ?? 99;
    const bp = PRIORITY_RANK[b.priority] ?? 99;
    if (ap !== bp) return ap - bp;
    // 4) 기한 (null = 뒤)
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    // 5) tie-break: 최근 등록 우선
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function createTodo(data: {
  title: string;
  content?: string;
  dueDate?: string;
  priority?: string;
  assigneeId?: string;
  assigneeName?: string;
  category?: string;
  targetRole?: "MENTOR" | "STAFF" | "ALL" | null;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const now = new Date();
  const editorId = session.user.id;
  const editorName = session.user.name ?? "알 수 없음";

  // Todo 본체 + 최초 등록 스냅샷(v1) 을 한 트랜잭션으로.
  const todo = await prisma.$transaction(async (tx) => {
    const created = await tx.todo.create({
      data: {
        title: data.title.trim(),
        content: data.content?.trim() || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        priority: data.priority ?? "NORMAL",
        authorId: editorId,
        authorName: editorName,
        assigneeId: data.assigneeId || null,
        assigneeName: data.assigneeName?.trim() || null,
        category: data.category?.trim() || null,
        targetRole: data.targetRole ?? null,
        lastEditorId: editorId,
        lastEditorName: editorName,
        lastEditedAt: now,
      },
    });
    await tx.todoVersion.create({
      data: {
        todoId: created.id,
        version: 1,
        title: created.title,
        content: created.content,
        dueDate: created.dueDate,
        priority: created.priority,
        assigneeId: created.assigneeId,
        assigneeName: created.assigneeName,
        category: created.category,
        editorId,
        editorName,
      },
    });
    return created;
  });

  revalidatePath("/todos");
  revalidatePath("/");
  return todo;
}

export async function updateTodo(
  id: string,
  data: {
    title?: string;
    content?: string;
    dueDate?: string | null;
    priority?: string;
    assigneeId?: string | null;
    assigneeName?: string | null;
    category?: string | null;
    targetRole?: "MENTOR" | "STAFF" | "ALL" | null;
  }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // 전체 스태프 수정 가능 (STUDENT 만 차단). 기존의 authorId 제한 제거 —
  // 원본은 TodoVersion 으로 보존되므로 공동 편집해도 이력이 남음.
  if (!isStaff(session.user.role)) throw new Error("수정 권한이 없습니다");

  const existing = await prisma.todo.findUnique({ where: { id } });
  if (!existing) throw new Error("할 일을 찾을 수 없습니다");

  const editorId = session.user.id;
  const editorName = session.user.name ?? "알 수 없음";

  const todo = await prisma.$transaction(async (tx) => {
    // 수정 직전 상태를 다음 버전으로 스냅샷.
    // 최신 version 번호 +1 (최초 등록이 v1 이므로 첫 수정은 v2).
    const latest = await tx.todoVersion.findFirst({
      where: { todoId: id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    await tx.todoVersion.create({
      data: {
        todoId: id,
        version: nextVersion,
        title: existing.title,
        content: existing.content,
        dueDate: existing.dueDate,
        priority: existing.priority,
        assigneeId: existing.assigneeId,
        assigneeName: existing.assigneeName,
        category: existing.category,
        editorId: existing.lastEditorId ?? existing.authorId,
        editorName: existing.lastEditorName ?? existing.authorName,
        // createdAt 은 스냅샷 시점이 아니라 '해당 버전이 유효했던 시작 시각' 의미로
        // 원본의 lastEditedAt 또는 createdAt 을 사용.
        createdAt: existing.lastEditedAt ?? existing.createdAt,
      },
    });

    return tx.todo.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title.trim() }),
        ...(data.content !== undefined && { content: data.content?.trim() || null }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId || null }),
        ...(data.assigneeName !== undefined && { assigneeName: data.assigneeName?.trim() || null }),
        ...(data.category !== undefined && { category: data.category?.trim() || null }),
        ...(data.targetRole !== undefined && { targetRole: data.targetRole }),
        lastEditorId: editorId,
        lastEditorName: editorName,
        lastEditedAt: new Date(),
      },
    });
  });

  revalidatePath("/todos");
  revalidatePath("/");
  return todo;
}

export async function toggleTodo(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.todo.findUnique({ where: { id }, select: { isCompleted: true } });
  if (!existing) throw new Error("할 일을 찾을 수 없습니다");

  await prisma.todo.update({
    where: { id },
    data: {
      isCompleted: !existing.isCompleted,
      completedAt: !existing.isCompleted ? new Date() : null,
    },
  });

  revalidatePath("/todos");
  revalidatePath("/");
}

export async function deleteTodo(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.todo.findUnique({ where: { id } });
  if (!existing) throw new Error("할 일을 찾을 수 없습니다");
  // 삭제는 원본 작성자 또는 DIRECTOR/SUPER_ADMIN 만 허용. 이력 보존 취지상 신중하게.
  const canDelete = existing.authorId === session.user.id || isFullAccess(session.user.role);
  if (!canDelete) throw new Error("삭제 권한이 없습니다");

  await prisma.todo.delete({ where: { id } });
  revalidatePath("/todos");
  revalidatePath("/");
}

// 수정 이력 조회 — STAFF 이상.
export async function getTodoVersions(todoId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!isStaff(session.user.role)) throw new Error("조회 권한이 없습니다");

  return prisma.todoVersion.findMany({
    where: { todoId },
    orderBy: { version: "desc" },
  });
}
