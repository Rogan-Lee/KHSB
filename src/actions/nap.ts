"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { notifySlack } from "@/lib/slack";
import { todayKST } from "@/lib/utils";
import type { NapStatus } from "@/generated/prisma/enums";

const NAP_DAILY_LIMIT = 2; // "use server" 파일은 async 함수만 export 가능 — 내부 상수로 유지
const DURATIONS = [20, 30];

export type NapView = {
  id: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  durationMin: number;
  status: NapStatus;
  note: string | null;
  decidedByName: string | null;
  createdAt: string;
};

type NapRow = {
  id: string;
  date: Date;
  startTime: string;
  durationMin: number;
  status: NapStatus;
  note: string | null;
  decidedByName: string | null;
  createdAt: Date;
};

function toView(n: NapRow): NapView {
  return {
    id: n.id,
    date: n.date.toISOString().slice(0, 10),
    startTime: n.startTime,
    durationMin: n.durationMin,
    status: n.status,
    note: n.note,
    decidedByName: n.decidedByName,
    createdAt: n.createdAt.toISOString(),
  };
}

// ─────────────────────────── 학생 측 (매직링크 토큰 인증) ───────────────────────────

/** 오늘 + 최근 7일 쪽잠 신청 목록과 오늘 사용 횟수(REJECTED 제외). */
export async function getMyNaps(token: string) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");

  const today = todayKST();
  const since = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const naps = await prisma.napRequest.findMany({
    where: { studentId: session.student.id, date: { gte: since } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const todayStr = today.toISOString().slice(0, 10);
  const todayCount = naps.filter(
    (n) => n.date.toISOString().slice(0, 10) === todayStr && n.status !== "REJECTED"
  ).length;

  return { naps: naps.map(toView), todayCount, limit: NAP_DAILY_LIMIT };
}

/** 쪽잠 신청 — 오늘 날짜로 생성. 하루 2회 제한(REJECTED 제외). */
export async function requestNap(
  token: string,
  params: { startTime: string; durationMin: number }
) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");

  if (!/^\d{2}:\d{2}$/.test(params.startTime)) {
    throw new Error("시작 시간을 선택해 주세요");
  }
  if (!DURATIONS.includes(params.durationMin)) {
    throw new Error("쪽잠 시간은 20분 또는 30분만 선택할 수 있어요");
  }

  const date = todayKST();
  // ponytail: 동시요청 race 허용 — 승인 단계에서 걸러짐
  const count = await prisma.napRequest.count({
    where: { studentId: session.student.id, date, status: { not: "REJECTED" } },
  });
  if (count >= NAP_DAILY_LIMIT) {
    throw new Error("쪽잠은 하루 2회까지 신청할 수 있어요");
  }

  await prisma.napRequest.create({
    data: {
      studentId: session.student.id,
      date,
      startTime: params.startTime,
      durationMin: params.durationMin,
    },
  });

  notifySlack(
    `😴 [쪽잠 신청] ${session.student.name}(${session.student.grade}) — ${params.startTime} · ${params.durationMin}분`
  );
  revalidatePath("/approvals");
  return { ok: true };
}

// ─────────────────────────── 직원 측 (requireStaff) ───────────────────────────

export type StaffNapView = NapView & {
  student: { id: string; name: string; grade: string };
};

/** 특정 날짜(기본 오늘)의 쪽잠 신청 전체 — 대기 우선. */
export async function listNaps(date?: string): Promise<StaffNapView[]> {
  const session = await auth();
  requireStaff(session?.user?.role);

  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date) : todayKST();
  const naps = await prisma.napRequest.findMany({
    where: { date: d },
    orderBy: [{ status: "asc" }, { startTime: "asc" }],
    include: { student: { select: { id: true, name: true, grade: true } } },
  });
  return naps.map((n) => ({ ...toView(n), student: n.student }));
}

/** 쪽잠 승인/거절 — 결정자 이름 스냅샷 + 메모. */
export async function decideNap(id: string, decision: "approve" | "reject", note?: string) {
  const session = await auth();
  requireStaff(session?.user?.role);

  await prisma.napRequest.update({
    where: { id },
    data: {
      status: decision === "approve" ? "APPROVED" : "REJECTED",
      note: note?.trim() || null,
      decidedById: session!.user.id,
      decidedByName: session!.user.name ?? null,
      decidedAt: new Date(),
    },
  });

  revalidatePath("/approvals");
  return { ok: true };
}
