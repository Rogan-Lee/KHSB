"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireFullAccess } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { decideRewardRedemption } from "@/lib/request-decisions";
import { loadStudentPointsData, requestRedemptionForStudent } from "@/lib/student-rewards-core";
import type { RedemptionStatus } from "@/generated/prisma/enums";

// ─────────────────────────── 학생 측 (매직링크 토큰 인증) ───────────────────────────
// 핵심 로직은 src/lib/student-rewards-core.ts (학생 앱과 공용). 여기서는 토큰 인증만.

export type {
  PointHistoryEntry,
  RewardItemView,
  RedemptionView,
} from "@/lib/student-rewards-core";

/** 학생 포인트 화면 데이터 — 잔액 + 통합 내역 + 상품 + 내 신청. */
export async function getStudentPointsData(token: string) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");

  return {
    studentName: session.student.name,
    ...(await loadStudentPointsData(session.student.id)),
  };
}

/** 기프티콘 교환 신청 — 잔액(대기중 신청 포함) 검증 후 PENDING 생성. */
export async function requestRedemption(token: string, itemId: string, note?: string) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");
  return requestRedemptionForStudent(session.student, itemId, note);
}

// ─────────────────────────── 직원 측 ───────────────────────────

/** 교환 신청 목록 (상태 필터 옵션). */
export async function listRedemptions(status?: RedemptionStatus) {
  const s = await auth();
  requireStaff(s?.user?.role);

  return prisma.rewardRedemption.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { student: { select: { name: true, grade: true } } },
  });
}

/** 신청 처리 — 승인/거절(대기중만), 지급(승인됨만). 승인 시 잔액 재검증. */
export async function decideRedemption(
  id: string,
  action: "approve" | "reject" | "fulfill",
  note?: string
) {
  const s = await auth();
  requireStaff(s?.user?.role);

  // 핵심 로직(상태 검증·잔액 재검증)은 @/lib/request-decisions (모바일 승인함과 공용)
  await decideRewardRedemption(id, action, { id: s!.user.id, name: s!.user.name ?? null }, note);

  revalidatePath("/merit-demerit");
}

// ─────────────────────────── 상품 관리 (관리자 전용) ───────────────────────────

export async function createRewardItem(params: {
  name: string;
  points: number;
  sortOrder?: number;
}) {
  const s = await auth();
  requireFullAccess(s?.user?.role);

  const name = params.name.trim();
  if (!name) throw new Error("상품명을 입력해 주세요");
  if (!Number.isInteger(params.points) || params.points <= 0) {
    throw new Error("필요 포인트는 1 이상의 정수여야 합니다");
  }

  await prisma.rewardItem.create({
    data: { name, points: params.points, sortOrder: params.sortOrder ?? 0 },
  });
  revalidatePath("/merit-demerit");
}

export async function updateRewardItem(
  id: string,
  params: { name?: string; points?: number; active?: boolean; sortOrder?: number }
) {
  const s = await auth();
  requireFullAccess(s?.user?.role);

  const data: { name?: string; points?: number; active?: boolean; sortOrder?: number } = {};
  if (params.name !== undefined) {
    const name = params.name.trim();
    if (!name) throw new Error("상품명을 입력해 주세요");
    data.name = name;
  }
  if (params.points !== undefined) {
    if (!Number.isInteger(params.points) || params.points <= 0) {
      throw new Error("필요 포인트는 1 이상의 정수여야 합니다");
    }
    data.points = params.points;
  }
  if (params.active !== undefined) data.active = params.active;
  if (params.sortOrder !== undefined) data.sortOrder = params.sortOrder;

  await prisma.rewardItem.update({ where: { id }, data });
  revalidatePath("/merit-demerit");
}

/** 상품 삭제 — 교환 내역이 있으면 비활성 처리(스냅샷·이력 보존). */
export async function deleteRewardItem(id: string) {
  const s = await auth();
  requireFullAccess(s?.user?.role);

  const count = await prisma.rewardRedemption.count({ where: { itemId: id } });
  if (count > 0) {
    await prisma.rewardItem.update({ where: { id }, data: { active: false } });
  } else {
    await prisma.rewardItem.delete({ where: { id } });
  }
  revalidatePath("/merit-demerit");
}
