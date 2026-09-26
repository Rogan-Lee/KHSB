"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAnyStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";

const NAME_MAX = 100;
const CONTENT_MAX = 5000;

async function requireStaffSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);
  return session.user;
}

// 보안: 클라이언트 객체를 prisma data 에 그대로 넘기지 않는다 (id·createdAt 등 임의 컬럼 지정 차단)
function pickTemplate(data: { name: string; content: string }) {
  if (!data || typeof data.name !== "string" || typeof data.content !== "string") {
    throw new Error("템플릿 이름과 내용을 입력하세요");
  }
  const name = data.name.trim();
  if (!name || name.length > NAME_MAX) throw new Error(`템플릿 이름은 1~${NAME_MAX}자로 입력하세요`);
  if (data.content.length > CONTENT_MAX) throw new Error(`템플릿 내용은 ${CONTENT_MAX}자 이하로 입력하세요`);
  return { name, content: data.content };
}

export async function getMessageTemplates() {
  await requireStaffSession();

  return prisma.messageTemplate.findMany({
    orderBy: { createdAt: "asc" },
  });
}

export async function createMessageTemplate(data: { name: string; content: string }) {
  await requireStaffSession();

  const created = await prisma.messageTemplate.create({ data: pickTemplate(data), select: { id: true, name: true, content: true, createdAt: true, updatedAt: true } });
  revalidatePath("/messages");
  return created;
}

export async function updateMessageTemplate(id: string, data: { name: string; content: string }) {
  await requireStaffSession();

  await prisma.messageTemplate.update({ where: { id }, data: pickTemplate(data) });
  revalidatePath("/messages");
}

export async function deleteMessageTemplate(id: string) {
  await requireStaffSession();

  await prisma.messageTemplate.delete({ where: { id } });
  revalidatePath("/messages");
}
