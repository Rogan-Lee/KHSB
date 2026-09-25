"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { decideNetworkRequest as decideNetworkRequestCore } from "@/lib/request-decisions";
import {
  loadStudentNetworkRequests,
  requestNetworkForStudent,
  toNetworkRequestView,
  type NetworkRequestInput,
  type NetworkRequestView,
} from "@/lib/student-network-core";
import type { NapStatus } from "@/generated/prisma/enums";

// ─────────────────────────── 학생 측 (매직링크 토큰 인증) ───────────────────────────
// 핵심 로직은 src/lib/student-network-core.ts (학생 앱과 공용). 여기서는 토큰 인증만.

export type { NetworkRequestView } from "@/lib/student-network-core";

/** 본인 네트워크 사용 신청 목록 — 최신순. */
export async function getMyNetworkRequests(token: string): Promise<NetworkRequestView[]> {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");
  return loadStudentNetworkRequests(session.student.id);
}

/** 네트워크 사용 신청. startAt/endAt은 "YYYY-MM-DDTHH:MM" (KST). */
export async function requestNetwork(token: string, params: NetworkRequestInput) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");
  return requestNetworkForStudent(session.student, params);
}

// ─────────────────────────── 직원 측 (requireStaff) ───────────────────────────

export type StaffNetworkRequestView = NetworkRequestView & {
  student: { id: string; name: string; grade: string };
};

/** 네트워크 신청 목록 — 상태 필터(미지정 시 전체), 대기 우선. */
export async function listNetworkRequests(status?: NapStatus): Promise<StaffNetworkRequestView[]> {
  const session = await auth();
  requireStaff(session?.user?.role);

  const requests = await prisma.networkRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: "asc" }, { startAt: "asc" }],
    take: 200,
    include: { student: { select: { id: true, name: true, grade: true } } },
  });
  return requests.map((r) => ({ ...toNetworkRequestView(r), student: r.student }));
}

/** 네트워크 신청 승인/거절 — 승인 시 어댑터로 정책 적용, 거절 전환 시 회수. */
export async function decideNetworkRequest(id: string, decision: "approve" | "reject") {
  const session = await auth();
  requireStaff(session?.user?.role);

  await decideNetworkRequestCore(id, decision, {
    id: session!.user.id,
    name: session!.user.name ?? null,
  });

  revalidatePath("/approvals");
  return { ok: true };
}
