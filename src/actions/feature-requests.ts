"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { RequestStatus, RequestCategory, RequestPriority } from "@/generated/prisma";
import { notifySlack, formatFeatureRequestAlert } from "@/lib/slack";

async function getSession() {
  const session = await auth();
  if (!session?.user) throw new Error("인증 필요");
  return session.user;
}

export async function getFeatureRequests() {
  return prisma.featureRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { comments: true } } },
  });
}

export async function getFeatureRequestById(id: string) {
  await getSession();
  return prisma.featureRequest.findUnique({
    where: { id },
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

  const category = (data.category as RequestCategory) ?? "FEATURE";
  const priority = (data.priority as RequestPriority) ?? "NORMAL";

  await prisma.featureRequest.create({
    data: {
      title: data.title.trim(),
      description: data.description?.trim() || null,
      category,
      priority,
      relatedPage: data.relatedPage || null,
      requester: data.requester?.trim() || null,
      authorId: user.id,
      authorName: user.name ?? "알 수 없음",
    },
  });

  notifySlack(formatFeatureRequestAlert({
    title: data.title.trim(),
    category,
    priority,
    requester: data.requester,
    authorName: user.name ?? "알 수 없음",
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/requests`,
  }));

  revalidatePath("/requests");
}

/**
 * 현재 user 의 id 를 FeatureRequest.seenById 배열에 추가 (이미 있으면 noop).
 * 헤더 배지 unseen 카운트용. PENDING/IN_PROGRESS 만 대상으로 처리한다.
 */
export async function markFeatureRequestSeen(id: string) {
  const user = await getSession();
  const fr = await prisma.featureRequest.findUnique({
    where: { id },
    select: { seenById: true },
  });
  if (!fr) return;
  if (fr.seenById.includes(user.id)) return;
  await prisma.featureRequest.update({
    where: { id },
    data: { seenById: { set: [...fr.seenById, user.id] } },
  });
}

/**
 * 현재 user 가 아직 보지 못한 PENDING/IN_PROGRESS FeatureRequest 들의 ID 를
 * 모두 seen 처리한다. 페이지 진입 시 호출.
 */
export async function markAllOpenFeatureRequestsSeen() {
  const user = await getSession();
  const open = await prisma.featureRequest.findMany({
    where: {
      status: { in: ["PENDING", "IN_PROGRESS"] },
      NOT: { seenById: { has: user.id } },
    },
    select: { id: true, seenById: true },
  });
  if (open.length === 0) return 0;
  await Promise.all(
    open.map((fr) =>
      prisma.featureRequest.update({
        where: { id: fr.id },
        data: { seenById: { set: [...fr.seenById, user.id] } },
      }),
    ),
  );
  revalidatePath("/requests");
  return open.length;
}

/**
 * 현재 user 가 아직 보지 않은 open(PENDING/IN_PROGRESS) FeatureRequest 개수.
 * 헤더 배지에 사용.
 */
export async function getUnseenFeatureRequestCount(): Promise<number> {
  const user = await getSession();
  return prisma.featureRequest.count({
    where: {
      status: { in: ["PENDING", "IN_PROGRESS"] },
      NOT: { seenById: { has: user.id } },
    },
  });
}

export async function updateRequestStatus(id: string, status: RequestStatus) {
  await getSession();
  await prisma.featureRequest.update({ where: { id }, data: { status } });
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
  const existing = await prisma.featureRequest.findUnique({ where: { id } });
  if (!existing) throw new Error("요청을 찾을 수 없습니다");
  if (existing.authorId !== user.id && user.role !== "DIRECTOR" && user.role !== "SUPER_ADMIN") {
    throw new Error("수정 권한이 없습니다");
  }

  await prisma.featureRequest.update({
    where: { id },
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
  const existing = await prisma.featureRequest.findUnique({ where: { id } });
  if (!existing) throw new Error("요청을 찾을 수 없습니다");
  if (existing.authorId !== user.id && user.role !== "DIRECTOR" && user.role !== "SUPER_ADMIN") {
    throw new Error("삭제 권한이 없습니다");
  }

  await prisma.featureRequest.delete({ where: { id } });
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
  const comment = await prisma.featureRequestComment.findUnique({ where: { id: commentId } });
  if (!comment) throw new Error("댓글을 찾을 수 없습니다");
  if (comment.authorId !== user.id && user.role !== "DIRECTOR" && user.role !== "SUPER_ADMIN") {
    throw new Error("삭제 권한이 없습니다");
  }

  await prisma.featureRequestComment.delete({ where: { id: commentId } });
  revalidatePath("/requests");
  revalidatePath(`/requests/${comment.featureRequestId}`);
}
