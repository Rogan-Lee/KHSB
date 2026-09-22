"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { notifySlack } from "@/lib/slack";
import { applyNetworkPolicy, revokeNetworkPolicy } from "@/lib/network-adapter";
import { NETWORK_KIND_LABELS } from "@/lib/network-requests";
import type { NapStatus, NetworkRequestKind } from "@/generated/prisma/enums";

const MAX_TARGET_LEN = 200;
const MAX_REASON_LEN = 500;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export type NetworkRequestView = {
  id: string;
  kind: NetworkRequestKind;
  target: string | null;
  startAt: string;
  endAt: string;
  reason: string;
  status: NapStatus;
  appliedAt: string | null;
  decidedByName: string | null;
  createdAt: string;
};

type NetworkRow = {
  id: string;
  kind: NetworkRequestKind;
  target: string | null;
  startAt: Date;
  endAt: Date;
  reason: string;
  status: NapStatus;
  appliedAt: Date | null;
  decidedByName: string | null;
  createdAt: Date;
};

function toView(r: NetworkRow): NetworkRequestView {
  return {
    id: r.id,
    kind: r.kind,
    target: r.target,
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    reason: r.reason,
    status: r.status,
    appliedAt: r.appliedAt?.toISOString() ?? null,
    decidedByName: r.decidedByName,
    createdAt: r.createdAt.toISOString(),
  };
}

// ─────────────────────────── 학생 측 (매직링크 토큰 인증) ───────────────────────────

/** 본인 네트워크 사용 신청 목록 — 최신순. */
export async function getMyNetworkRequests(token: string): Promise<NetworkRequestView[]> {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");

  const requests = await prisma.networkRequest.findMany({
    where: { studentId: session.student.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return requests.map(toView);
}

/** 네트워크 사용 신청. startAt/endAt은 "YYYY-MM-DDTHH:MM" (KST). */
export async function requestNetwork(
  token: string,
  params: {
    kind: NetworkRequestKind;
    target?: string;
    startAt: string;
    endAt: string;
    reason: string;
  }
) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");

  if (!(params.kind in NETWORK_KIND_LABELS)) throw new Error("신청 유형을 선택해 주세요");

  const target = (params.target ?? "").trim().slice(0, MAX_TARGET_LEN) || null;
  if (params.kind === "DOMAIN_ALLOW" && !target) {
    throw new Error("허용할 사이트 주소를 입력해 주세요");
  }
  if (params.kind === "APP_UNBLOCK" && !target) {
    throw new Error("사용할 앱 이름을 입력해 주세요");
  }

  const reason = params.reason.trim();
  if (!reason) throw new Error("사용 사유를 입력해 주세요");
  if (reason.length > MAX_REASON_LEN) {
    throw new Error(`사유는 ${MAX_REASON_LEN}자 이하로 작성해 주세요`);
  }

  if (!DATETIME_RE.test(params.startAt) || !DATETIME_RE.test(params.endAt)) {
    throw new Error("사용 시간을 선택해 주세요");
  }
  const startAt = new Date(`${params.startAt}:00+09:00`);
  const endAt = new Date(`${params.endAt}:00+09:00`);
  if (endAt <= startAt) throw new Error("종료 시간은 시작 시간보다 늦어야 해요");

  await prisma.networkRequest.create({
    data: {
      studentId: session.student.id,
      kind: params.kind,
      target,
      startAt,
      endAt,
      reason,
    },
  });

  notifySlack(
    `📶 [네트워크 신청] ${session.student.name}(${session.student.grade}) — ${NETWORK_KIND_LABELS[params.kind]}${target ? ` · ${target}` : ""} (${params.startAt.slice(11)}~${params.endAt.slice(11)})`
  );
  revalidatePath("/approvals");
  return { ok: true };
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
  return requests.map((r) => ({ ...toView(r), student: r.student }));
}

/** 네트워크 신청 승인/거절 — 승인 시 어댑터로 정책 적용, 거절 전환 시 회수. */
export async function decideNetworkRequest(id: string, decision: "approve" | "reject") {
  const session = await auth();
  requireStaff(session?.user?.role);

  const req = await prisma.networkRequest.findUnique({ where: { id } });
  if (!req) throw new Error("신청을 찾을 수 없습니다");

  let appliedAt = req.appliedAt;
  if (decision === "approve") {
    appliedAt = (await applyNetworkPolicy(req)).appliedAt;
  } else if (req.status === "APPROVED" && req.appliedAt) {
    await revokeNetworkPolicy(req);
    appliedAt = null;
  }

  await prisma.networkRequest.update({
    where: { id },
    data: {
      status: decision === "approve" ? "APPROVED" : "REJECTED",
      appliedAt,
      decidedById: session!.user.id,
      decidedByName: session!.user.name ?? null,
      decidedAt: new Date(),
    },
  });

  revalidatePath("/approvals");
  return { ok: true };
}
