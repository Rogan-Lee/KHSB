"use server";

import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isStaff } from "@/lib/roles";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

export async function getTodos() {
  const session = await getSession();

  // STAFF 이상은 전체 투두 조회, 그 외는 본인 것만
  const where = isStaff(session.role)
    ? { orgId: session.orgId }
    : {
        orgId: session.orgId,
        OR: [
          { authorId: session.id },
          { assigneeId: session.id },
        ],
      };

  return prisma.todo.findMany({
    where,
    orderBy: [{ isCompleted: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
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
}) {
  const session = await getSession();

  const todo = await prisma.todo.create({
    data: {
      orgId: session.orgId,
      title: data.title.trim(),
      content: data.content?.trim() || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      priority: data.priority ?? "NORMAL",
      authorId: session.id,
      authorName: session.name ?? "알 수 없음",
      assigneeId: data.assigneeId || null,
      assigneeName: data.assigneeName?.trim() || null,
      category: data.category?.trim() || null,
    },
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
  }
) {
  const session = await getSession();

  const existing = await prisma.todo.findUnique({ where: { id, orgId: session.orgId } });
  if (!existing) throw new Error("할 일을 찾을 수 없습니다");
  if (existing.authorId !== session.id) throw new Error("수정 권한이 없습니다");

  const todo = await prisma.todo.update({
    where: { id, orgId: session.orgId },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.content !== undefined && { content: data.content?.trim() || null }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId || null }),
      ...(data.assigneeName !== undefined && { assigneeName: data.assigneeName?.trim() || null }),
      ...(data.category !== undefined && { category: data.category?.trim() || null }),
    },
  });

  revalidatePath("/todos");
  revalidatePath("/");
  return todo;
}

export async function toggleTodo(id: string) {
  const session = await getSession();

  const existing = await prisma.todo.findUnique({ where: { id, orgId: session.orgId }, select: { isCompleted: true } });
  if (!existing) throw new Error("할 일을 찾을 수 없습니다");

  await prisma.todo.update({
    where: { id, orgId: session.orgId },
    data: {
      isCompleted: !existing.isCompleted,
      completedAt: !existing.isCompleted ? new Date() : null,
    },
  });

  revalidatePath("/todos");
  revalidatePath("/");
}

export async function deleteTodo(id: string) {
  const session = await getSession();

  const existing = await prisma.todo.findUnique({ where: { id, orgId: session.orgId } });
  if (!existing) throw new Error("할 일을 찾을 수 없습니다");
  if (existing.authorId !== session.id) throw new Error("삭제 권한이 없습니다");

  await prisma.todo.delete({ where: { id, orgId: session.orgId } });
  revalidatePath("/todos");
  revalidatePath("/");
}
