"use server";

import { prisma } from "@/lib/prisma";
import {
  birthDateToYYMMDD,
  checkExpiry,
  clearGatePass,
  getRequestMeta,
  grantGatePass,
  isGateLocked,
  normalizeDigits,
  phoneLast4,
  recordGateFailure,
  safeEqual,
  type GateScope,
} from "@/lib/token-auth";

export type GateResult = { ok: true } | { ok: false; reason: GateFailReason };
export type GateFailReason =
  | "not_found"
  | "expired"
  | "revoked"
  | "locked"
  | "invalid"
  | "no_credential";

// ───────────────────── 학생 게이트 (/s/[token]) ─────────────────────

/**
 * 학생 매직링크 본인 확인: 학생 생년월일 YYMMDD 6자리.
 * birthDate 가 null 인 학생은 게이트 면제 (운영자가 데이터 보완할 때까지).
 */
export async function verifyStudentGate(
  token: string,
  birthInput: string
): Promise<GateResult> {
  const scope: GateScope = "STUDENT";
  const { ip, ua } = await getRequestMeta();
  if (await isGateLocked(scope, token, ip)) return { ok: false, reason: "locked" };

  const link = await prisma.studentMagicLink.findUnique({
    where: { token },
    include: { student: { select: { id: true, birthDate: true } } },
  });
  if (!link) return { ok: false, reason: "not_found" };
  const fail = checkExpiry({ expiresAt: link.expiresAt, revokedAt: link.revokedAt });
  if (fail) return { ok: false, reason: fail };
  if (!link.student.birthDate) return { ok: false, reason: "no_credential" };

  const expected = birthDateToYYMMDD(link.student.birthDate);
  const given = normalizeDigits(birthInput);
  if (given.length !== 6 || !safeEqual(given, expected)) {
    await recordGateFailure(scope, token, ip, ua);
    return { ok: false, reason: "invalid" };
  }

  await grantGatePass(scope, token, link.student.id, link.expiresAt);
  return { ok: true };
}

// ───────────────────── 학부모 게이트 (/r, /sp, /cr) ─────────────────────

type ParentTokenModel = "parent-report" | "study-plan" | "consultation";

async function resolveParentToken(
  model: ParentTokenModel,
  token: string
): Promise<
  | { ok: true; studentId: string; parentPhone: string; expiresAt: Date }
  | { ok: false; reason: "not_found" | "expired" | "revoked" | "no_credential" }
> {
  if (model === "parent-report") {
    const r = await prisma.parentReport.findUnique({
      where: { token },
      include: { student: { select: { id: true, parentPhone: true } } },
    });
    if (!r) return { ok: false, reason: "not_found" };
    const fail = checkExpiry({ expiresAt: r.expiresAt, revokedAt: r.revokedAt });
    if (fail) return { ok: false, reason: fail };
    if (!r.student.parentPhone) return { ok: false, reason: "no_credential" };
    return {
      ok: true,
      studentId: r.student.id,
      parentPhone: r.student.parentPhone,
      expiresAt: r.expiresAt!,
    };
  }
  if (model === "study-plan") {
    const r = await prisma.studyPlanReport.findUnique({
      where: { token },
      include: { student: { select: { id: true, parentPhone: true } } },
    });
    if (!r) return { ok: false, reason: "not_found" };
    const fail = checkExpiry({ expiresAt: r.expiresAt, revokedAt: r.revokedAt });
    if (fail) return { ok: false, reason: fail };
    if (!r.student.parentPhone) return { ok: false, reason: "no_credential" };
    return {
      ok: true,
      studentId: r.student.id,
      parentPhone: r.student.parentPhone,
      expiresAt: r.expiresAt!,
    };
  }
  // consultation
  const r = await prisma.consultationReport.findUnique({
    where: { token },
    include: {
      consultation: {
        include: { student: { select: { id: true, parentPhone: true } } },
      },
    },
  });
  if (!r) return { ok: false, reason: "not_found" };
  const fail = checkExpiry({ expiresAt: r.expiresAt, revokedAt: r.revokedAt });
  if (fail) return { ok: false, reason: fail };
  const student = r.consultation.student;
  // 면담 리포트는 가망 고객(prospect)인 경우 학생 레코드가 없을 수 있다 → 게이트 면제
  if (!student || !student.parentPhone) return { ok: false, reason: "no_credential" };
  return {
    ok: true,
    studentId: student.id,
    parentPhone: student.parentPhone,
    expiresAt: r.expiresAt!,
  };
}

export async function verifyParentGate(
  model: ParentTokenModel,
  token: string,
  phoneInput: string
): Promise<GateResult> {
  const scope: GateScope = "PARENT";
  const { ip, ua } = await getRequestMeta();
  if (await isGateLocked(scope, token, ip)) return { ok: false, reason: "locked" };

  const resolved = await resolveParentToken(model, token);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };

  const expected = phoneLast4(resolved.parentPhone);
  const given = normalizeDigits(phoneInput);
  if (!expected) return { ok: false, reason: "no_credential" };
  if (given.length !== 4 || !safeEqual(given, expected)) {
    await recordGateFailure(scope, token, ip, ua);
    return { ok: false, reason: "invalid" };
  }

  await grantGatePass(scope, token, resolved.studentId, resolved.expiresAt);
  return { ok: true };
}

// ───────────────────── 근무자/관리자 게이트 (/w/[token]) ─────────────────────

/**
 * 순찰 매직링크 본인 확인: 근무자(User) 전화번호 뒷 4자리.
 * phone 미설정 사용자는 발급 단계에서 차단되므로 정상 흐름엔 없음.
 */
export async function verifyStaffGate(
  token: string,
  phoneInput: string
): Promise<GateResult> {
  const scope: GateScope = "STAFF";
  const { ip, ua } = await getRequestMeta();
  if (await isGateLocked(scope, token, ip)) return { ok: false, reason: "locked" };

  const link = await prisma.staffMagicLink.findUnique({
    where: { token },
    include: { user: { select: { id: true, phone: true, status: true } } },
  });
  if (!link) return { ok: false, reason: "not_found" };
  const fail = checkExpiry({ expiresAt: link.expiresAt, revokedAt: link.revokedAt });
  if (fail) return { ok: false, reason: fail };
  if (link.user.status === "TERMINATED") return { ok: false, reason: "revoked" };

  const expected = phoneLast4(link.user.phone);
  if (!expected) return { ok: false, reason: "no_credential" };

  const given = normalizeDigits(phoneInput);
  if (given.length !== 4 || !safeEqual(given, expected)) {
    await recordGateFailure(scope, token, ip, ua);
    return { ok: false, reason: "invalid" };
  }

  await grantGatePass(scope, token, link.user.id, link.expiresAt);
  return { ok: true };
}

// 디버그/로그아웃 용도
export async function clearParentGate(token: string) {
  await clearGatePass("PARENT", token);
}
export async function clearStudentGate(token: string) {
  await clearGatePass("STUDENT", token);
}
export async function clearStaffGate(token: string) {
  await clearGatePass("STAFF", token);
}
