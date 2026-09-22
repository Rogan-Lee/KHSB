"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireFullAccess } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { calcPointBalance } from "@/lib/points";
import { notifySlack } from "@/lib/slack";
import type { RedemptionStatus } from "@/generated/prisma/enums";

const MAX_NOTE_LEN = 300;

// ─────────────────────────── 학생 측 (매직링크 토큰 인증) ───────────────────────────

export type PointHistoryEntry = {
  kind: "MERIT" | "DEMERIT" | "REDEMPTION";
  date: string; // ISO
  points: number;
  label: string;
  status?: RedemptionStatus; // REDEMPTION 전용
};

export type RewardItemView = { id: string; name: string; points: number };

export type RedemptionView = {
  id: string;
  itemName: string;
  points: number;
  status: RedemptionStatus;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
};

/** 학생 포인트 화면 데이터 — 잔액 + 통합 내역 + 상품 + 내 신청. */
export async function getStudentPointsData(token: string) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");
  const studentId = session.student.id;

  const [merits, redemptions, items] = await Promise.all([
    prisma.meritDemerit.findMany({
      where: { studentId },
      orderBy: { date: "desc" },
      select: { type: true, points: true, reason: true, date: true },
    }),
    prisma.rewardRedemption.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        itemName: true,
        points: true,
        status: true,
        note: true,
        createdAt: true,
        decidedAt: true,
      },
    }),
    prisma.rewardItem.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, points: true },
    }),
  ]);

  const { balance } = calcPointBalance({ merits, redemptions });

  const history: PointHistoryEntry[] = [
    ...merits.map((m) => ({
      kind: m.type,
      date: m.date.toISOString(),
      points: m.points,
      label: m.reason,
    })),
    ...redemptions
      .filter((r) => r.status !== "REJECTED")
      .map((r) => ({
        kind: "REDEMPTION" as const,
        date: r.createdAt.toISOString(),
        points: r.points,
        label: r.itemName,
        status: r.status,
      })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const myRedemptions: RedemptionView[] = redemptions.map((r) => ({
    id: r.id,
    itemName: r.itemName,
    points: r.points,
    status: r.status,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
  }));

  return {
    studentName: session.student.name,
    balance,
    history,
    items: items as RewardItemView[],
    myRedemptions,
  };
}

/** 기프티콘 교환 신청 — 잔액(대기중 신청 포함) 검증 후 PENDING 생성. */
export async function requestRedemption(token: string, itemId: string, note?: string) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");
  const studentId = session.student.id;

  const item = await prisma.rewardItem.findUnique({ where: { id: itemId } });
  if (!item || !item.active) throw new Error("상품을 찾을 수 없습니다");

  const [merits, redemptions] = await Promise.all([
    prisma.meritDemerit.findMany({
      where: { studentId },
      select: { type: true, points: true },
    }),
    prisma.rewardRedemption.findMany({
      where: { studentId },
      select: { status: true, points: true },
    }),
  ]);
  const { balance } = calcPointBalance({ merits, redemptions });
  // ponytail: 대기중 신청분도 선차감해 중복 신청을 막는다 — 최종 검증은 승인 시점에 다시 수행
  const pendingReserved = redemptions
    .filter((r) => r.status === "PENDING")
    .reduce((acc, r) => acc + r.points, 0);
  if (balance - pendingReserved < item.points) {
    throw new Error("포인트가 부족합니다 (대기중인 신청 포함)");
  }

  const redemption = await prisma.rewardRedemption.create({
    data: {
      studentId,
      itemId: item.id,
      itemName: item.name,
      points: item.points,
      note: (note ?? "").trim().slice(0, MAX_NOTE_LEN) || null,
    },
    select: { id: true },
  });

  notifySlack(
    `🎁 [포인트 상점] ${session.student.name}(${session.student.grade}) — "${item.name}" ${item.points}점 교환 신청`
  );

  revalidatePath("/merit-demerit");
  return { id: redemption.id };
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

  const redemption = await prisma.rewardRedemption.findUnique({ where: { id } });
  if (!redemption) throw new Error("신청을 찾을 수 없습니다");

  let nextStatus: RedemptionStatus;
  if (action === "approve" || action === "reject") {
    if (redemption.status !== "PENDING") throw new Error("대기중인 신청만 처리할 수 있습니다");
    nextStatus = action === "approve" ? "APPROVED" : "REJECTED";
  } else {
    if (redemption.status !== "APPROVED") throw new Error("승인된 신청만 지급 처리할 수 있습니다");
    nextStatus = "FULFILLED";
  }

  if (action === "approve") {
    // 승인 시점 잔액 재검증 (이 신청은 아직 PENDING이므로 차감 전)
    const [merits, redemptions] = await Promise.all([
      prisma.meritDemerit.findMany({
        where: { studentId: redemption.studentId },
        select: { type: true, points: true },
      }),
      prisma.rewardRedemption.findMany({
        where: { studentId: redemption.studentId },
        select: { status: true, points: true },
      }),
    ]);
    const { balance } = calcPointBalance({ merits, redemptions });
    if (balance < redemption.points) {
      throw new Error(`포인트 잔액이 부족합니다 (잔액 ${balance}점 / 필요 ${redemption.points}점)`);
    }
  }

  await prisma.rewardRedemption.update({
    where: { id },
    data: {
      status: nextStatus,
      note: note?.trim() ? note.trim().slice(0, MAX_NOTE_LEN) : redemption.note,
      decidedById: s!.user.id,
      decidedByName: s!.user.name ?? null,
      decidedAt: new Date(),
    },
  });

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
