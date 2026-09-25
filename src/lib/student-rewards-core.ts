import { revalidatePath } from "next/cache";

import type { RedemptionStatus } from "@/generated/prisma/enums";
import { MobileApiError } from "@/lib/mobile-auth";
import { calcPointBalance } from "@/lib/points";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";

// 학생 포인트·기프티콘 교환(학생 측) 핵심 로직 — 학생 ID 기준.
// 인증은 호출 측 책임: 웹 서버 액션(src/actions/rewards.ts, 매직링크 토큰)과
// 학생 앱 라우트(src/lib/mobile-student-life.ts, requireMobileStudent)가 같이 쓴다.
// 오류는 MobileApiError(Error 하위 클래스, 한국어 메시지 + HTTP 상태)로 던진다.

const MAX_NOTE_LEN = 300;

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

type StudentRef = { id: string; name: string; grade: string };

/** 학생 포인트 화면 데이터 — 잔액 + 통합 내역 + 상품 + 내 신청. */
export async function loadStudentPointsData(studentId: string) {
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
    balance,
    history,
    items: items as RewardItemView[],
    myRedemptions,
  };
}

/** 기프티콘 교환 신청 — 잔액(대기중 신청 포함) 검증 후 PENDING 생성. */
export async function requestRedemptionForStudent(
  student: StudentRef,
  itemId: string,
  note?: string,
) {
  const studentId = student.id;

  const item = await prisma.rewardItem.findUnique({ where: { id: itemId } });
  if (!item || !item.active) throw new MobileApiError("상품을 찾을 수 없습니다", 404);

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
    throw new MobileApiError("포인트가 부족합니다 (대기중인 신청 포함)", 400);
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
    `🎁 [포인트 상점] ${student.name}(${student.grade}) — "${item.name}" ${item.points}점 교환 신청`
  );

  revalidatePath("/merit-demerit");
  return { id: redemption.id };
}
