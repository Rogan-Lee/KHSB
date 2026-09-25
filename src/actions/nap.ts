"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { decideNapRequest } from "@/lib/request-decisions";
import {
  loadStudentNaps,
  requestNapForStudent,
  toNapView,
  type NapView,
} from "@/lib/student-nap-core";
import { todayKST } from "@/lib/utils";

// ─────────────────────────── 학생 측 (매직링크 토큰 인증) ───────────────────────────
// 핵심 로직은 src/lib/student-nap-core.ts (학생 앱과 공용). 여기서는 토큰 인증만.

export type { NapView } from "@/lib/student-nap-core";

/** 오늘 + 최근 7일 쪽잠 신청 목록과 오늘 사용 횟수(REJECTED 제외). */
export async function getMyNaps(token: string) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");

  const { naps, todayCount, limit } = await loadStudentNaps(session.student.id);
  return { naps, todayCount, limit };
}

/** 쪽잠 신청 — 오늘 날짜로 생성. 하루 2회 제한(REJECTED 제외). */
export async function requestNap(
  token: string,
  params: { startTime: string; durationMin: number }
) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");
  return requestNapForStudent(session.student, params);
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
  return naps.map((n) => ({ ...toNapView(n), student: n.student }));
}

/** 쪽잠 승인/거절 — 결정자 이름 스냅샷 + 메모. */
export async function decideNap(id: string, decision: "approve" | "reject", note?: string) {
  const session = await auth();
  requireStaff(session?.user?.role);

  await decideNapRequest(
    id,
    decision,
    { id: session!.user.id, name: session!.user.name ?? null },
    note,
  );

  revalidatePath("/approvals");
  return { ok: true };
}
