"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireFullAccess } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { notifySlack } from "@/lib/slack";
import { CATEGORY_LABELS } from "@/lib/suggestions";
import type { SuggestionCategory, SuggestionStatus } from "@/generated/prisma/enums";

const MAX_TITLE_LEN = 120;
const MAX_CONTENT_LEN = 2000;
const MAX_REPLY_LEN = 2000;
const CATEGORIES: SuggestionCategory[] = ["FACILITY", "CLASS", "OPERATION", "ETC"];
const STATUSES: SuggestionStatus[] = ["RECEIVED", "REVIEWING", "REFLECTED", "DECLINED"];

export type SuggestionView = {
  id: string;
  category: SuggestionCategory;
  title: string;
  content: string;
  status: SuggestionStatus;
  staffReply: string | null;
  handledByName: string | null;
  handledAt: string | null;
  createdAt: string;
  hasUnseenUpdate: boolean; // 학생 측 — 직원 처리 후 미확인
  deletedAt: string | null; // 원장이 삭제 처리한 시각 — 학생에게 '삭제됨' 안내
};

export type StaffSuggestionView = SuggestionView & {
  studentId: string;
  studentName: string;
  studentGrade: string;
  isHidden: boolean; // 원장이 숨김 처리 (목록에서 흐리게/접힘)
};

function isUnseen(statusUpdatedAt: Date | null, studentReadAt: Date | null): boolean {
  if (!statusUpdatedAt) return false;
  if (!studentReadAt) return true;
  return statusUpdatedAt.getTime() > studentReadAt.getTime();
}

// ─────────────────────────── 학생 측 (매직링크 토큰 인증) ───────────────────────────

/** 새 건의사항 제출. */
export async function createStudentSuggestion(params: {
  studentToken: string;
  category: SuggestionCategory;
  title: string;
  content: string;
}) {
  const session = await validateMagicLink(params.studentToken);
  if (!session) throw new Error("인증이 만료되었습니다");

  const title = params.title.trim();
  if (!title) throw new Error("제목을 입력해 주세요");
  if (title.length > MAX_TITLE_LEN) throw new Error(`제목은 ${MAX_TITLE_LEN}자 이하로 작성해 주세요`);

  const content = params.content.trim();
  if (!content) throw new Error("건의 내용을 입력해 주세요");
  if (content.length > MAX_CONTENT_LEN) throw new Error(`내용은 ${MAX_CONTENT_LEN}자 이하로 작성해 주세요`);

  const category: SuggestionCategory = CATEGORIES.includes(params.category) ? params.category : "ETC";

  const created = await prisma.studentSuggestion.create({
    data: {
      studentId: session.student.id,
      category,
      title,
      content,
      status: "RECEIVED",
      studentReadAt: new Date(), // 본인 제출은 미확인 아님
    },
    select: { id: true },
  });

  notifySlack(
    `📮 [학생 건의] ${session.student.name}(${session.student.grade}) · ${CATEGORY_LABELS[category]} — "${title}"`
  );

  revalidatePath("/suggestions");
  revalidatePath("/");
  return { id: created.id };
}

/** 본인 건의 목록 (최신순). */
export async function listStudentSuggestions(params: { studentToken: string }): Promise<SuggestionView[]> {
  const session = await validateMagicLink(params.studentToken);
  if (!session) throw new Error("인증이 만료되었습니다");

  const rows = await prisma.studentSuggestion.findMany({
    where: { studentId: session.student.id },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    title: r.title,
    content: r.content,
    status: r.status,
    staffReply: r.staffReply,
    handledByName: r.handledByName,
    handledAt: r.handledAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    hasUnseenUpdate: isUnseen(r.statusUpdatedAt, r.studentReadAt),
    deletedAt: r.deletedAt?.toISOString() ?? null,
  }));
}

/** 학생이 건의 탭을 열면 미확인 배지 클리어 (studentReadAt = now). */
export async function markStudentSuggestionsRead(params: { studentToken: string }) {
  const session = await validateMagicLink(params.studentToken);
  if (!session) throw new Error("인증이 만료되었습니다");
  await prisma.studentSuggestion.updateMany({
    where: { studentId: session.student.id },
    data: { studentReadAt: new Date() },
  });
  return { ok: true };
}

/** 학생 측 미확인(직원 처리 후 안 본) 건의 수 — 포털 배지용. */
export async function countUnseenSuggestionUpdates(studentId: string): Promise<number> {
  const rows = await prisma.studentSuggestion.findMany({
    where: { studentId, statusUpdatedAt: { not: null } },
    select: { statusUpdatedAt: true, studentReadAt: true },
  });
  return rows.filter((r) => isUnseen(r.statusUpdatedAt, r.studentReadAt)).length;
}

// ─────────────────────────── 직원 측 (세션 인증, 전 직원) ───────────────────────────

/** 전체 건의 목록 (직원). 상태·카테고리 필터. */
export async function getStudentSuggestions(params?: {
  status?: SuggestionStatus;
  category?: SuggestionCategory;
}): Promise<StaffSuggestionView[]> {
  const session = await auth();
  requireStaff(session?.user?.role);

  const rows = await prisma.studentSuggestion.findMany({
    where: {
      deletedAt: null, // 삭제 처리된 건의는 직원 목록에서 제외
      ...(params?.status ? { status: params.status } : {}),
      ...(params?.category ? { category: params.category } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { student: { select: { name: true, grade: true } } },
  });

  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    title: r.title,
    content: r.content,
    status: r.status,
    staffReply: r.staffReply,
    handledByName: r.handledByName,
    handledAt: r.handledAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    hasUnseenUpdate: false,
    deletedAt: null,
    studentId: r.studentId,
    studentName: r.student.name,
    studentGrade: r.student.grade,
    isHidden: !!r.hiddenAt,
  }));
}

/** 상태 변경 (전 직원). */
export async function setSuggestionStatus(params: { id: string; status: SuggestionStatus }) {
  const session = await auth();
  requireStaff(session?.user?.role);
  if (!STATUSES.includes(params.status)) throw new Error("상태값이 올바르지 않습니다");

  await prisma.studentSuggestion.update({
    where: { id: params.id },
    data: {
      status: params.status,
      handledById: session!.user!.id,
      handledByName: session!.user!.name ?? "",
      handledAt: new Date(),
      statusUpdatedAt: new Date(),
    },
  });
  revalidatePath("/suggestions");
  revalidatePath("/");
  return { ok: true };
}

/** 답변 작성 (+선택적 상태 변경). 전 직원. */
export async function replyToSuggestion(params: { id: string; reply: string; status?: SuggestionStatus }) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const reply = params.reply.trim();
  if (!reply) throw new Error("답변 내용을 입력해 주세요");
  if (reply.length > MAX_REPLY_LEN) throw new Error(`답변은 ${MAX_REPLY_LEN}자 이하로 작성해 주세요`);
  if (params.status && !STATUSES.includes(params.status)) throw new Error("상태값이 올바르지 않습니다");

  await prisma.studentSuggestion.update({
    where: { id: params.id },
    data: {
      staffReply: reply,
      ...(params.status ? { status: params.status } : {}),
      handledById: session!.user!.id,
      handledByName: session!.user!.name ?? "",
      handledAt: new Date(),
      statusUpdatedAt: new Date(),
    },
  });
  revalidatePath("/suggestions");
  revalidatePath("/");
  return { ok: true };
}

/** 건의 숨김/숨김해제 (원장 — FULL_ACCESS). 직원 목록에서 흐리게/접힘. */
export async function setSuggestionHidden(params: { id: string; hidden: boolean }) {
  const session = await auth();
  requireFullAccess(session?.user?.role);
  await prisma.studentSuggestion.update({
    where: { id: params.id },
    data: { hiddenAt: params.hidden ? new Date() : null },
  });
  revalidatePath("/suggestions");
  return { ok: true };
}

/**
 * 건의 삭제 (원장 — FULL_ACCESS). 소프트 삭제: 직원 목록에서 사라지고,
 * 학생 포털에는 '관리자에 의해 삭제됨' 으로 표시(statusUpdatedAt 갱신 → 미확인 배지).
 */
export async function deleteStudentSuggestion(id: string) {
  const session = await auth();
  requireFullAccess(session?.user?.role);
  const sug = await prisma.studentSuggestion.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedById: session!.user!.id,
      statusUpdatedAt: new Date(), // 학생 미확인 배지 트리거
    },
    include: { student: { select: { name: true } } },
  });
  notifySlack(
    `🗑️ [건의 삭제] ${sug.student.name} · "${sug.title}" — ${session!.user!.name ?? "원장"} 처리`,
  );
  revalidatePath("/suggestions");
  revalidatePath("/");
  return { ok: true };
}

/** 신규(접수) 건의 수 — 사이드바 배지용. */
export async function getNewSuggestionCount(): Promise<number> {
  const session = await auth();
  requireStaff(session?.user?.role);
  return prisma.studentSuggestion.count({ where: { status: "RECEIVED" } });
}
