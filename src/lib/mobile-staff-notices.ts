import { z } from "zod";

import type { User } from "@/generated/prisma";
import {
  BROADCAST_AUDIENCES,
  BROADCAST_BODY_MAX,
  BROADCAST_TITLE_MAX,
  broadcastPush,
  countBroadcastTargets,
} from "@/lib/broadcast-push";
import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { isFullAccess } from "@/lib/roles";

// 직원 앱 — 공지(Announcement) 보기·작성 + 단체 알림(원장 전용).
// 웹: 멘토링 공지(/mentoring, page="mentoring"), 월간 리포트 공통 공지(/reports/monthly,
// page="monthly_notice" · "monthly_recommendation" — 최신 1건이 학부모 월간 리포트에 노출).

type StaffUser = Pick<User, "id" | "name" | "role">;

export const ANNOUNCEMENT_PAGES = {
  mentoring: { label: "멘토링 공지", history: true },
  monthly_notice: { label: "운영 공지", history: false },
  monthly_recommendation: { label: "이달의 권장 학습", history: false },
} as const;

export type AnnouncementPage = keyof typeof ANNOUNCEMENT_PAGES;
const PAGE_KEYS = Object.keys(ANNOUNCEMENT_PAGES) as [AnnouncementPage, ...AnnouncementPage[]];
const PAGE_SIZE = 20;

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new MobileApiError(result.error.issues[0]?.message ?? "입력값을 확인하세요", 400);
}

function requireEditor(user: StaffUser) {
  if (!isFullAccess(user.role)) {
    throw new MobileApiError("원장만 공지를 작성·수정할 수 있습니다", 403);
  }
}

function serializeAnnouncement(a: {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: { name: string };
}) {
  return {
    id: a.id,
    title: a.title,
    content: a.content,
    authorName: a.author.name,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export async function getMobileAnnouncements(
  user: StaffUser,
  pageParam: string | null,
  offsetParam: string | null,
) {
  const page: AnnouncementPage =
    pageParam && Object.hasOwn(ANNOUNCEMENT_PAGES, pageParam)
      ? (pageParam as AnnouncementPage)
      : "mentoring";
  const meta = ANNOUNCEMENT_PAGES[page];
  const offset = Math.max(0, Number.parseInt(offsetParam ?? "0", 10) || 0);
  const take = meta.history ? PAGE_SIZE : 1;

  const [items, total] = await Promise.all([
    prisma.announcement.findMany({
      where: { page },
      orderBy: { createdAt: "desc" },
      skip: meta.history ? offset : 0,
      take,
      include: { author: { select: { name: true } } },
    }),
    prisma.announcement.count({ where: { page } }),
  ]);

  return {
    page,
    label: meta.label,
    history: meta.history,
    canEdit: isFullAccess(user.role),
    items: items.map(serializeAnnouncement),
    total,
    nextOffset: meta.history && offset + items.length < total ? offset + items.length : null,
  };
}

const createSchema = z.object({
  page: z.enum(PAGE_KEYS),
  title: z.string().trim().max(100, "제목은 100자 이하로 입력하세요").optional().default(""),
  content: z
    .string()
    .trim()
    .min(1, "공지 내용을 입력하세요")
    .max(20000, "공지는 20,000자 이하로 입력하세요"),
});

const updateSchema = z.object({
  title: z.string().trim().max(100, "제목은 100자 이하로 입력하세요").optional(),
  content: z
    .string()
    .trim()
    .min(1, "공지 내용을 입력하세요")
    .max(20000, "공지는 20,000자 이하로 입력하세요"),
});

export async function createMobileAnnouncement(user: StaffUser, input: unknown) {
  requireEditor(user);
  const data = parseBody(createSchema, input);
  const title = data.title || ANNOUNCEMENT_PAGES[data.page].label;
  const created = await prisma.announcement.create({
    data: { title, content: data.content, page: data.page, authorId: user.id },
    include: { author: { select: { name: true } } },
  });
  return serializeAnnouncement(created);
}

export async function updateMobileAnnouncement(user: StaffUser, id: string, input: unknown) {
  requireEditor(user);
  const data = parseBody(updateSchema, input);
  const existing = await prisma.announcement.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new MobileApiError("공지를 찾을 수 없습니다", 404);
  // 웹 updateAnnouncement 와 같게 — 마지막 수정자를 작성자로 기록
  const updated = await prisma.announcement.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      content: data.content,
      authorId: user.id,
    },
    include: { author: { select: { name: true } } },
  });
  return serializeAnnouncement(updated);
}

export async function deleteMobileAnnouncement(user: StaffUser, id: string) {
  requireEditor(user);
  const existing = await prisma.announcement.findUnique({ where: { id }, select: { page: true } });
  if (!existing) throw new MobileApiError("공지를 찾을 수 없습니다", 404);
  // 월간 공지는 최신 1건이 학부모 리포트에 그대로 노출 — 삭제 대신 수정만 허용
  if (existing.page !== "mentoring") {
    throw new MobileApiError("월간 리포트 공지는 삭제할 수 없어요. 내용을 수정해 주세요", 400);
  }
  await prisma.announcement.delete({ where: { id } });
  return { ok: true };
}

// ─── 단체 알림 ──────────────────────────────────────────────────────

const broadcastSchema = z.object({
  audience: z.enum(BROADCAST_AUDIENCES),
  title: z
    .string()
    .trim()
    .min(1, "제목을 입력하세요")
    .max(BROADCAST_TITLE_MAX, "제목은 100자 이하로 입력하세요"),
  body: z
    .string()
    .trim()
    .min(1, "내용을 입력하세요")
    .max(BROADCAST_BODY_MAX, "내용은 1000자 이하로 입력하세요"),
});

function requireBroadcaster(user: StaffUser) {
  if (!isFullAccess(user.role)) {
    throw new MobileApiError("원장만 단체 알림을 보낼 수 있습니다", 403);
  }
}

export async function getMobileBroadcastTargets(user: StaffUser) {
  requireBroadcaster(user);
  const counts = await Promise.all(BROADCAST_AUDIENCES.map((a) => countBroadcastTargets(a)));
  return {
    targets: Object.fromEntries(BROADCAST_AUDIENCES.map((a, i) => [a, counts[i]])) as Record<
      (typeof BROADCAST_AUDIENCES)[number],
      number
    >,
  };
}

export async function sendMobileBroadcast(user: StaffUser, input: unknown) {
  requireBroadcaster(user);
  const data = parseBody(broadcastSchema, input);
  try {
    return await broadcastPush(data);
  } catch (error) {
    if (error instanceof MobileApiError) throw error;
    // broadcastPush 의 입력 검증 메시지(한국어)는 그대로 전달
    if (error instanceof Error && /입력|작성/.test(error.message)) {
      throw new MobileApiError(error.message, 400);
    }
    throw error;
  }
}
