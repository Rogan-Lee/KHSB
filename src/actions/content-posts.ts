"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { isContentPostType, isInternalType, type ContentPostType } from "@/lib/content-posts-meta";

export type ContentPostInput = {
  type: ContentPostType;
  title: string;
  /** 요약/리드 문장 */
  summary?: string;
  /** podcast/article 필수, 자체 글(review/mentor/director)은 선택 */
  url?: string;
  /** markdown — review/mentor/director 필수 */
  body?: string;
  authorName?: string;
  authorRole?: string;
  /** landing/mentors-data.js 멘토 id 또는 "director" — 직접 입력이면 비움 */
  authorKey?: string;
  coverImageUrl?: string;
  /** "YYYY-MM-DD" (KST) */
  publishedAt: string;
  visible?: boolean;
};

async function requireStaffSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);
}

const HTTP_URL = /^https?:\/\/\S+$/i;

function toData(input: ContentPostInput) {
  if (!isContentPostType(input.type)) throw new Error("유형이 올바르지 않습니다");
  const internal = isInternalType(input.type);

  const title = input.title?.trim() ?? "";
  if (!title) throw new Error("제목을 입력해주세요");

  const url = input.url?.trim() || null;
  if (!internal && !url) throw new Error("URL을 입력해주세요");
  if (url && !HTTP_URL.test(url)) throw new Error("URL은 http:// 또는 https:// 로 시작해야 합니다");

  const coverImageUrl = input.coverImageUrl?.trim() || null;
  if (coverImageUrl && !HTTP_URL.test(coverImageUrl)) {
    throw new Error("커버 이미지 URL은 http:// 또는 https:// 로 시작해야 합니다");
  }

  // 외부 링크형(podcast/article)은 본문 편집기가 없으므로 본문을 저장하지 않는다.
  const body = internal ? input.body?.trim() || null : null;
  const authorName = input.authorName?.trim() || null;
  const authorRole = input.authorRole?.trim() || null;
  const authorKey = input.authorKey?.trim() || null;
  if (internal && !body) throw new Error("본문을 입력해주세요");
  if (internal && !authorName) throw new Error("작성자 이름을 입력해주세요");
  if (authorKey && !/^[a-z0-9_-]{1,40}$/.test(authorKey)) {
    throw new Error("작성자 선택이 올바르지 않습니다");
  }

  const publishedAt = new Date(`${input.publishedAt}T00:00:00+09:00`);
  if (isNaN(publishedAt.getTime())) throw new Error("발행일이 올바르지 않습니다");

  return {
    type: input.type,
    title,
    summary: input.summary?.trim() || null,
    url,
    body,
    authorName,
    authorRole,
    authorKey,
    coverImageUrl,
    publishedAt,
    ...(typeof input.visible === "boolean" ? { visible: input.visible } : {}),
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
