"use server";

import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { RequestStatus, RequestCategory, RequestPriority } from "@/generated/prisma";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

export async function getFeatureRequests() {
  const session = await getSession();
  return prisma.featureRequest.findMany({
    where: { orgId: session.orgId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { comments: true } } },
  });
}

export async function getFeatureRequestById(id: string) {
  const session = await getSession();
  return prisma.featureRequest.findUnique({
    where: { id, orgId: session.orgId },
    include: {
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function createFeatureRequest(data: {
  title: string;
  description?: string;
  category?: string;
  priority?: string;
  relatedPage?: string;
  requester?: string;
}) {
  const user = await getSession();
  if (!data.title.trim()) throw new Error("제목을 입력하세요");

  await prisma.featureRequest.create({
    data: {
      orgId: user.orgId,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      category: (data.category as RequestCategory) ?? "FEATURE",
      priority: (data.priority as RequestPriority) ?? "NORMAL",
      relatedPage: data.relatedPage || null,
      requester: data.requester?.trim() || null,
      authorId: user.id,
      authorName: user.name ?? "알 수 없음",
    },
  });
  revalidatePath("/requests");
}

export async function updateRequestStatus(id: string, status: RequestStatus) {
  const session = await getSession();
  await prisma.featureRequest.update({ where: { id, orgId: session.orgId }, data: { status } });
  revalidatePath("/requests");
  revalidatePath(`/requests/${id}`);
}

export async function updateFeatureRequest(id: string, data: {
  title: string;
  description?: string;
  category?: string;
  priority?: string;
  relatedPage?: string;
  requester?: string;
}) {
  const user = await getSession();
  const existing = await prisma.featureRequest.findUnique({ where: { id, orgId: user.orgId } });
  if (!existing) throw new Error("요청을 찾을 수 없습니다");
  if (existing.authorId !== user.id && user.role !== "DIRECTOR" && user.role !== "ADMIN") {
    throw new Error("수정 권한이 없습니다");
  }

  await prisma.featureRequest.update({
    where: { id, orgId: user.orgId },
    data: {
      title: data.title.trim(),
      description: data.description?.trim() || null,
      category: (data.category as RequestCategory) ?? existing.category,
      priority: (data.priority as RequestPriority) ?? existing.priority,
      relatedPage: data.relatedPage || null,
      requester: data.requester?.trim() || null,
    },
  });
  revalidatePath("/requests");
  revalidatePath(`/requests/${id}`);
}

export async function deleteFeatureRequest(id: string) {
  const user = await getSession();
  const existing = await prisma.featureRequest.findUnique({ where: { id, orgId: user.orgId } });
  if (!existing) throw new Error("요청을 찾을 수 없습니다");
  if (existing.authorId !== user.id && user.role !== "DIRECTOR" && user.role !== "ADMIN") {
    throw new Error("삭제 권한이 없습니다");
  }

  await prisma.featureRequest.delete({ where: { id, orgId: user.orgId } });
  revalidatePath("/requests");
}

export async function createFeatureRequestComment(
  featureRequestId: string,
  content: string,
) {
  const user = await getSession();
  if (!content.trim()) throw new Error("내용을 입력하세요");

  await prisma.featureRequestComment.create({
    data: {
      orgId: user.orgId,
      content: content.trim(),
      featureRequestId,
      authorId: user.id,
      authorName: user.name ?? "알 수 없음",
      authorRole: user.role,
    },
  });
  revalidatePath("/requests");
  revalidatePath(`/requests/${featureRequestId}`);
}

export async function deleteFeatureRequestComment(commentId: string) {
  const user = await getSession();
  const comment = await prisma.featureRequestComment.findUnique({ where: { id: commentId, orgId: user.orgId } });
  if (!comment) throw new Error("댓글을 찾을 수 없습니다");
  if (comment.authorId !== user.id && user.role !== "DIRECTOR" && user.role !== "ADMIN") {
    throw new Error("삭제 권한이 없습니다");
  }

  await prisma.featureRequestComment.delete({ where: { id: commentId, orgId: user.orgId } });
  revalidatePath("/requests");
  revalidatePath(`/requests/${comment.featureRequestId}`);
}
