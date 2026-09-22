"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";

export type ContentPostType = "podcast" | "article";

export type ContentPostInput = {
  type: ContentPostType;
  title: string;
  summary?: string;
  url: string;
  coverImageUrl?: string;
  /** "YYYY-MM-DD" (KST) */
  publishedAt: string;
};

async function requireStaffSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);
}

function toData(input: ContentPostInput) {
  const title = input.title.trim();
  const url = input.url.trim();
  if (input.type !== "podcast" && input.type !== "article") throw new Error("유형이 올바르지 않습니다");
  if (!title) throw new Error("제목을 입력해주세요");
  if (!/^https?:\/\//.test(url)) throw new Error("URL은 http:// 또는 https:// 로 시작해야 합니다");
  const publishedAt = new Date(`${input.publishedAt}T00:00:00+09:00`);
  if (isNaN(publishedAt.getTime())) throw new Error("발행일이 올바르지 않습니다");
  return {
    type: input.type,
    title,
    summary: input.summary?.trim() || null,
    url,
    coverImageUrl: input.coverImageUrl?.trim() || null,
    publishedAt,
  };
}

export async function getContentPosts() {
  await requireStaffSession();
  return prisma.contentPost.findMany({ orderBy: { publishedAt: "desc" } });
}

export async function createContentPost(input: ContentPostInput) {
  await requireStaffSession();
  await prisma.contentPost.create({ data: toData(input) });
  revalidatePath("/contents");
}

export async function updateContentPost(id: string, input: ContentPostInput) {
  await requireStaffSession();
  await prisma.contentPost.update({ where: { id }, data: toData(input) });
  revalidatePath("/contents");
}

export async function deleteContentPost(id: string) {
  await requireStaffSession();
  await prisma.contentPost.delete({ where: { id } });
  revalidatePath("/contents");
}

export async function toggleContentPostVisible(id: string, visible: boolean) {
  await requireStaffSession();
  await prisma.contentPost.update({ where: { id }, data: { visible } });
  revalidatePath("/contents");
}
