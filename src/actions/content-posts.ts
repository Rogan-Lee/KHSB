"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import {
  isContentPostType,
  isInternalType,
  LANDING_VIDEO_EXTRA_MAX,
  LANDING_VIDEOS_KEY,
  youtubeId,
  type ContentPostType,
} from "@/lib/content-posts-meta";
import { LANDING_POPUP_KEY, type LandingPopup } from "@/lib/landing-popup";

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

/** 랜딩 홈 영상 칸 — 기본 영상(가운데) + 추가 영상(양옆, 최대 2). 기본 영상을 비우면 자동(최신 영상 순)으로 되돌린다. */
export async function setLandingVideos(main: string | null, extra: string[]) {
  await requireStaffSession();
  if (!main) {
    await prisma.appSetting.deleteMany({ where: { key: LANDING_VIDEOS_KEY } });
    revalidatePath("/contents");
    return;
  }
  const ids = [main, ...extra.filter(Boolean)];
  if (ids.length > 1 + LANDING_VIDEO_EXTRA_MAX) throw new Error(`추가 영상은 ${LANDING_VIDEO_EXTRA_MAX}개까지 고를 수 있습니다`);
  if (new Set(ids).size !== ids.length) throw new Error("같은 영상을 두 번 고를 수 없습니다");
  const rows = await prisma.contentPost.findMany({
    where: { id: { in: ids }, type: "podcast" },
    select: { url: true },
  });
  if (rows.length !== ids.length) throw new Error("영상을 찾을 수 없습니다");
  if (rows.some((r) => !youtubeId(r.url))) throw new Error("유튜브 링크인 팟캐스트만 고를 수 있습니다");

  const value = JSON.stringify({ main, extra: ids.slice(1) });
  await prisma.appSetting.upsert({
    where: { key: LANDING_VIDEOS_KEY },
    update: { value },
    create: { key: LANDING_VIDEOS_KEY, value },
  });
  revalidatePath("/contents");
}

export type LandingPopupInput = Omit<LandingPopup, "updatedAt">;

/** 랜딩 홈 공지 팝업 저장. 켜려면 제목 · 내용 필수, 버튼은 문구 · 링크를 같이. */
export async function setLandingPopup(input: LandingPopupInput) {
  await requireStaffSession();
  const title = input.title?.trim() ?? "";
  const body = input.body?.trim() ?? "";
  const until = input.until?.trim() || null;
  const ctaLabel = input.ctaLabel?.trim() || null;
  const ctaUrl = input.ctaUrl?.trim() || null;
  if (input.active && !title) throw new Error("팝업 제목을 입력해주세요");
  if (input.active && !body) throw new Error("팝업 내용을 입력해주세요");
  if (title.length > 100) throw new Error("제목은 100자까지 쓸 수 있습니다");
  if (body.length > 10000) throw new Error("내용이 너무 깁니다");
  if (until && (!/^\d{4}-\d{2}-\d{2}$/.test(until) || isNaN(new Date(`${until}T00:00:00+09:00`).getTime()))) {
    throw new Error("표시 마지막 날이 올바르지 않습니다");
  }
  if (!!ctaLabel !== !!ctaUrl) throw new Error("버튼 문구와 링크를 함께 입력해주세요");
  if (ctaLabel && ctaLabel.length > 30) throw new Error("버튼 문구는 30자까지 쓸 수 있습니다");
  if (ctaUrl && !HTTP_URL.test(ctaUrl)) throw new Error("버튼 링크는 http:// 또는 https:// 로 시작해야 합니다");

  const popup: LandingPopup = { active: !!input.active, title, body, until, ctaLabel, ctaUrl, updatedAt: new Date().toISOString() };
  const value = JSON.stringify(popup);
  await prisma.appSetting.upsert({
    where: { key: LANDING_POPUP_KEY },
    update: { value },
    create: { key: LANDING_POPUP_KEY, value },
  });
  revalidatePath("/contents");
}
