import { z } from "zod";

import type { NetworkRequestKind } from "@/generated/prisma/enums";
import { MobileApiError } from "@/lib/mobile-auth";
import { NETWORK_KIND_ORDER } from "@/lib/network-requests";
import { POINTS_PER_10000_KRW } from "@/lib/points";
import { loadStudentNaps, NAP_DURATIONS, requestNapForStudent } from "@/lib/student-nap-core";
import {
  loadStudentNetworkRequests,
  requestNetworkForStudent,
} from "@/lib/student-network-core";
import {
  loadStudentPointsData,
  requestRedemptionForStudent,
} from "@/lib/student-rewards-core";

// 학생 앱 — 포인트·기프티콘 / 쪽잠 / 네트워크 사용 신청.
// 웹 학생 포털(/s/[token]/{points,nap,network})과 같은 규칙: 핵심 로직은 src/lib/student-*-core.ts 공용.
// 인증은 라우트의 requireMobileStudent (매직링크 토큰은 쓰지 않는다).

type StudentRef = { id: string; name: string; grade: string };

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (result.success) return result.data;
  throw new MobileApiError(result.error.issues[0]?.message ?? "입력값을 확인하세요", 400);
}

// ─── 포인트 ─────────────────────────────────────────────────────────

export async function getMobileStudentPoints(studentId: string) {
  const data = await loadStudentPointsData(studentId);
  // 원화 환산은 표시용 상수(25점 = 10,000원) — 앱이 같은 식으로 계산하도록 함께 내려준다
  return { ...data, pointsPer10000Krw: POINTS_PER_10000_KRW };
}

const redemptionSchema = z.object({
  itemId: z.string({ error: "상품을 선택해 주세요" }).trim().min(1, "상품을 선택해 주세요").max(64),
  note: z.string().max(1000).optional().nullable(),
});

export async function requestMobileStudentRedemption(student: StudentRef, input: unknown) {
  const body = parseBody(redemptionSchema, input);
  return requestRedemptionForStudent(student, body.itemId, body.note ?? undefined);
}

// ─── 쪽잠 ───────────────────────────────────────────────────────────

export async function getMobileStudentNaps(studentId: string) {
  const data = await loadStudentNaps(studentId);
  return { ...data, durations: NAP_DURATIONS };
}

const napSchema = z.object({
  startTime: z.string({ error: "시작 시간을 선택해 주세요" }),
  durationMin: z.number({ error: "쪽잠 시간을 선택해 주세요" }).int(),
});

export async function requestMobileStudentNap(student: StudentRef, input: unknown) {
  const body = parseBody(napSchema, input);
  return requestNapForStudent(student, body);
}

// ─── 네트워크 사용 ──────────────────────────────────────────────────

export async function getMobileStudentNetwork(studentId: string) {
  return { requests: await loadStudentNetworkRequests(studentId) };
}

const networkSchema = z.object({
  kind: z.enum(NETWORK_KIND_ORDER as [NetworkRequestKind, ...NetworkRequestKind[]], {
    error: "신청 유형을 선택해 주세요",
  }),
  target: z.string().max(1000).optional().nullable(),
  startAt: z.string({ error: "사용 시간을 선택해 주세요" }),
  endAt: z.string({ error: "사용 시간을 선택해 주세요" }),
  reason: z.string({ error: "사용 사유를 입력해 주세요" }),
});

export async function requestMobileStudentNetwork(student: StudentRef, input: unknown) {
  const body = parseBody(networkSchema, input);
  return requestNetworkForStudent(student, {
    kind: body.kind,
    target: body.target ?? undefined,
    startAt: body.startAt,
    endAt: body.endAt,
    reason: body.reason,
  });
}
