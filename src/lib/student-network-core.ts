import { revalidatePath } from "next/cache";

import type { NapStatus, NetworkRequestKind } from "@/generated/prisma/enums";
import { MobileApiError } from "@/lib/mobile-auth";
import { NETWORK_KIND_LABELS } from "@/lib/network-requests";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";

// 네트워크(와이파이·사이트·앱) 사용 신청(학생 측) 핵심 로직 — 학생 ID 기준.
// 인증은 호출 측 책임: 웹 서버 액션(src/actions/network-requests.ts, 매직링크 토큰)과
// 학생 앱 라우트(src/lib/mobile-student-life.ts, requireMobileStudent)가 같이 쓴다.
// 오류는 MobileApiError(Error 하위 클래스, 한국어 메시지 + HTTP 상태)로 던진다.

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

type StudentRef = { id: string; name: string; grade: string };

export type NetworkRequestInput = {
  kind: NetworkRequestKind;
  target?: string;
  /** "YYYY-MM-DDTHH:MM" (KST) */
  startAt: string;
  /** "YYYY-MM-DDTHH:MM" (KST) */
  endAt: string;
  reason: string;
};

export function toNetworkRequestView(r: NetworkRow): NetworkRequestView {
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

/** 본인 네트워크 사용 신청 목록 — 최신순. */
export async function loadStudentNetworkRequests(studentId: string): Promise<NetworkRequestView[]> {
  const requests = await prisma.networkRequest.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return requests.map(toNetworkRequestView);
}

/** 네트워크 사용 신청. startAt/endAt은 "YYYY-MM-DDTHH:MM" (KST). */
export async function requestNetworkForStudent(student: StudentRef, params: NetworkRequestInput) {
  // `in` 은 프로토타입 키("toString" 등)도 통과시키므로 own property 로 검사
  if (typeof params.kind !== "string" || !Object.hasOwn(NETWORK_KIND_LABELS, params.kind)) {
    throw new MobileApiError("신청 유형을 선택해 주세요", 400);
  }

  const target =
    (typeof params.target === "string" ? params.target : "").trim().slice(0, MAX_TARGET_LEN) || null;
  if (params.kind === "DOMAIN_ALLOW" && !target) {
    throw new MobileApiError("허용할 사이트 주소를 입력해 주세요", 400);
  }
  if (params.kind === "APP_UNBLOCK" && !target) {
    throw new MobileApiError("사용할 앱 이름을 입력해 주세요", 400);
  }

  const reason = (typeof params.reason === "string" ? params.reason : "").trim();
  if (!reason) throw new MobileApiError("사용 사유를 입력해 주세요", 400);
  if (reason.length > MAX_REASON_LEN) {
    throw new MobileApiError(`사유는 ${MAX_REASON_LEN}자 이하로 작성해 주세요`, 400);
  }

  if (
    typeof params.startAt !== "string" ||
    typeof params.endAt !== "string" ||
    !DATETIME_RE.test(params.startAt) ||
    !DATETIME_RE.test(params.endAt)
  ) {
    throw new MobileApiError("사용 시간을 선택해 주세요", 400);
  }
  const startAt = new Date(`${params.startAt}:00+09:00`);
  const endAt = new Date(`${params.endAt}:00+09:00`);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new MobileApiError("사용 시간을 선택해 주세요", 400);
  }
  if (endAt <= startAt) throw new MobileApiError("종료 시간은 시작 시간보다 늦어야 해요", 400);

  await prisma.networkRequest.create({
    data: {
      studentId: student.id,
      kind: params.kind,
      target,
      startAt,
      endAt,
      reason,
    },
  });

  notifySlack(
    `📶 [네트워크 신청] ${student.name}(${student.grade}) — ${NETWORK_KIND_LABELS[params.kind]}${target ? ` · ${target}` : ""} (${params.startAt.slice(11)}~${params.endAt.slice(11)})`
  );
  revalidatePath("/approvals");
  return { ok: true };
}
