"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { randomUUID } from "node:crypto";
import { checkMessageExists, createSmsQrCode, OCTOMO_RECEIVER } from "@/lib/octomo";
import type {
  BranchWaitStatus,
  WaitGender,
  WaitGradeType,
  WaitlistStatus,
} from "@/generated/prisma/enums";

const CODE_TTL_MS = 5 * 60 * 1000; // 5분 (Octomo exists 조회 기준과 동일)
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10분
const SUBMIT_WINDOW_MS = 10 * 60 * 1000; // 인증 완료 후 제출 허용 시간
const MAX_ISSUES_PER_WINDOW = 5;
const MAX_VERIFY_ATTEMPTS = 10; // MO는 유저가 보낸 뒤 폴링이라 시도 여유

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/** 휴대폰 번호 정규화 — 숫자만. 한국 휴대폰(010, 11자리)만 허용. */
function normalizePhone(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return /^01[0-9]\d{7,8}$/.test(digits) ? digits : null;
}

// ─── 공개 신청 흐름 (인증 불필요) ─────────────────────────────────────────────

export type IssueCodeResult =
  | { ok: true; code: string; receiver: string; qrCode: string | null }
  | { ok: false; error: string };

/**
 * 인증코드 발급 (MO 방식). 코드를 화면에 표시 → 유저가 옥토모 대표번호로 문자 전송.
 * 발송하지 않고 코드/수신번호/QR(가능 시)을 반환. 전화번호당 10분 내 발급 횟수 제한.
 */
export async function issuePhoneCode(rawPhone: string): Promise<IssueCodeResult> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: "올바른 휴대폰 번호를 입력해주세요" };

  const recentIssues = await prisma.phoneVerification.count({
    where: { phone, createdAt: { gt: new Date(Date.now() - RATE_WINDOW_MS) } },
  });
  if (recentIssues >= MAX_ISSUES_PER_WINDOW) {
    return { ok: false, error: "잠시 후 다시 시도해주세요 (발급 횟수 초과)" };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6자리
  await prisma.phoneVerification.create({
    data: { phone, code, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });

  const qrCode = await createSmsQrCode(code);
  return { ok: true, code, receiver: OCTOMO_RECEIVER, qrCode };
}

/**
 * "보냈어요" 단계 — 유저가 코드 문자를 보낸 뒤 호출. Octomo 수신확인.
 * 성공 시 인증 완료(verifiedAt) 마킹. 미수신이면 재시도 안내.
 */
export async function confirmPhoneVerification(rawPhone: string): Promise<Result> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: "올바른 휴대폰 번호를 입력해주세요" };

  const verification = await prisma.phoneVerification.findFirst({
    where: { phone, verifiedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!verification) return { ok: false, error: "인증번호를 먼저 발급받아주세요" };
  if (verification.attemptCount >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, error: "인증 시도 횟수를 초과했습니다. 다시 발급받아주세요" };
  }

  let received: boolean;
  try {
    received = await checkMessageExists(phone, verification.code, 5);
  } catch {
    return { ok: false, error: "인증 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요" };
  }
  if (!received) {
    await prisma.phoneVerification.update({
      where: { id: verification.id },
      data: { attemptCount: { increment: 1 } },
    });
    return {
      ok: false,
      error: `아직 문자 수신이 확인되지 않았어요. 인증번호 ${verification.code}를 ${OCTOMO_RECEIVER}로 보낸 뒤 다시 눌러주세요`,
    };
  }

  await prisma.phoneVerification.update({
    where: { id: verification.id },
    data: { verifiedAt: new Date() },
  });
  return { ok: true };
}

export type WaitlistSubmitInput = {
  branchId: string;
  programId?: string | null;
  name: string;
  phone: string;
  gender: WaitGender;
  gradeType: WaitGradeType;
  note?: string;
  consentMarketing?: boolean;
};

/**
 * 대기 등록 — 본인인증(confirmPhoneVerification) 완료가 전제.
 * 최근 인증 완료 레코드가 없으면 거부. 성공 시 상태 페이지 토큰 반환.
 */
export async function submitWaitlist(
  input: WaitlistSubmitInput
): Promise<Result<{ token: string }>> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, error: "올바른 휴대폰 번호를 입력해주세요" };
  if (!input.name?.trim()) return { ok: false, error: "이름을 입력해주세요" };

  // 최근 인증 완료된 레코드 확인
  const verified = await prisma.phoneVerification.findFirst({
    where: { phone, verifiedAt: { gt: new Date(Date.now() - SUBMIT_WINDOW_MS) } },
    orderBy: { verifiedAt: "desc" },
  });
  if (!verified) return { ok: false, error: "휴대폰 본인인증을 먼저 완료해주세요" };

  // 지점 유효성 (활성 + 마감 아님)
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, isActive: true },
  });
  if (!branch) return { ok: false, error: "선택한 지점을 찾을 수 없습니다" };
  if (branch.waitStatus === "CLOSED") {
    return { ok: false, error: "해당 지점은 현재 신청을 받지 않습니다" };
  }

  const entry = await prisma.waitlist.create({
    data: {
      branchId: branch.id,
      programId: input.programId || null,
      name: input.name.trim(),
      phone,
      gender: input.gender,
      gradeType: input.gradeType,
      note: input.note?.trim() || null,
      consentMarketing: Boolean(input.consentMarketing),
      phoneVerifiedAt: verified.verifiedAt,
    },
  });

  return { ok: true, data: { token: entry.token } };
}

export type WaitlistPosition = {
  name: string;
  branchName: string;
  gradeType: WaitGradeType;
  gender: WaitGender;
  status: WaitlistStatus;
  createdAt: Date;
  overall: number; // 전체 기준 순번
  byGrade: number; // 학년(N수생/재학생) 기준 순번
};

/** 토큰으로 대기 순번 조회 (상태 페이지). 순번은 읽을 때 count 로 계산. */
export async function getWaitlistPosition(
  token: string
): Promise<WaitlistPosition | null> {
  const entry = await prisma.waitlist.findUnique({
    where: { token },
    include: { branch: true },
  });
  if (!entry) return null;

  // WAITING 인 본인보다 먼저 등록된 사람 수 + 본인(1)
  const base = {
    branchId: entry.branchId,
    status: "WAITING" as WaitlistStatus,
    createdAt: { lte: entry.createdAt },
  };
  const [overall, byGrade] = await Promise.all([
    prisma.waitlist.count({ where: base }),
    prisma.waitlist.count({ where: { ...base, gradeType: entry.gradeType } }),
  ]);

  return {
    name: entry.name,
    branchName: entry.branch.name,
    gradeType: entry.gradeType,
    gender: entry.gender,
    status: entry.status,
    createdAt: entry.createdAt,
    // 이미 초대/등원/취소된 경우 순번 의미 없음 → 0 처리
    overall: entry.status === "WAITING" ? overall : 0,
    byGrade: entry.status === "WAITING" ? byGrade : 0,
  };
}

// ─── 관리자 (requireStaff) ────────────────────────────────────────────────────

const STATUS_TIMESTAMP: Record<WaitlistStatus, string | null> = {
  WAITING: null,
  INVITED: "invitedAt",
  ENROLLED: "enrolledAt",
  CANCELLED: "cancelledAt",
};

/** 상태 변경 (초대/등원확정/대기복귀). 취소는 cancelWaitlist 사용. */
export async function setWaitlistStatus(id: string, status: WaitlistStatus): Promise<Result> {
  const session = await auth();
  requireStaff(session?.user?.role);

  const stampField = STATUS_TIMESTAMP[status];
  await prisma.waitlist.update({
    where: { id },
    data: {
      status,
      ...(stampField ? { [stampField]: new Date() } : {}),
      // 취소가 아닌 상태로 바뀌면 취소사유 제거
      ...(status === "CANCELLED" ? {} : { cancelReason: null }),
    },
  });
  revalidatePath("/waitlist");
  return { ok: true };
}

/** 취소 + 사유 기록. */
export async function cancelWaitlist(id: string, reason: string): Promise<Result> {
  const session = await auth();
  requireStaff(session?.user?.role);

  await prisma.waitlist.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason.trim() || null },
  });
  revalidatePath("/waitlist");
  return { ok: true };
}

/** 대기자 정보 풀 편집 (이름·연락처·프로그램·학년·성별·메모). */
export async function updateWaitlistEntry(
  id: string,
  data: {
    name?: string;
    phone?: string;
    programId?: string | null;
    gender?: WaitGender;
    gradeType?: WaitGradeType;
    note?: string | null;
  }
): Promise<Result> {
  const session = await auth();
  requireStaff(session?.user?.role);

  let phone: string | undefined;
  if (data.phone !== undefined) {
    const normalized = normalizePhone(data.phone);
    if (!normalized) return { ok: false, error: "올바른 휴대폰 번호를 입력해주세요" };
    phone = normalized;
  }
  if (data.name !== undefined && !data.name.trim()) {
    return { ok: false, error: "이름을 입력해주세요" };
  }

  await prisma.waitlist.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(data.programId !== undefined ? { programId: data.programId || null } : {}),
      ...(data.gender !== undefined ? { gender: data.gender } : {}),
      ...(data.gradeType !== undefined ? { gradeType: data.gradeType } : {}),
      ...(data.note !== undefined ? { note: data.note?.trim() || null } : {}),
    },
  });
  revalidatePath("/waitlist");
  return { ok: true };
}

export async function createBranch(input: {
  name: string;
  slug: string;
  waitStatus?: BranchWaitStatus;
  notice?: string;
}): Promise<Result> {
  const session = await auth();
  requireStaff(session?.user?.role);

  const slug = input.slug.trim().toLowerCase();
  if (!input.name?.trim() || !slug) return { ok: false, error: "지점명과 slug를 입력해주세요" };

  const exists = await prisma.branch.findUnique({ where: { slug } });
  if (exists) return { ok: false, error: "이미 사용 중인 slug 입니다" };

  await prisma.branch.create({
    data: {
      name: input.name.trim(),
      slug,
      waitStatus: input.waitStatus ?? "WAITLIST_OPEN",
      notice: input.notice?.trim() || null,
    },
  });
  revalidatePath("/waitlist");
  return { ok: true };
}

export async function updateBranch(
  id: string,
  data: {
    name?: string;
    waitStatus?: BranchWaitStatus;
    notice?: string | null;
    isActive?: boolean;
    capacity?: number | null;
  }
): Promise<Result> {
  const session = await auth();
  requireStaff(session?.user?.role);

  await prisma.branch.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.waitStatus !== undefined ? { waitStatus: data.waitStatus } : {}),
      ...(data.notice !== undefined ? { notice: data.notice?.trim() || null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
    },
  });
  revalidatePath("/waitlist");
  return { ok: true };
}

/**
 * 등록 안내 작성/수정 — 마크다운 저장 + 공개 링크 토큰 발급(최초 1회) + 상태 INVITED.
 * 학부모 리포트처럼 직원이 텍스트(등록 안내·정보 입력·입금 안내 등)를 넣어 링크로 전달.
 */
export async function saveWaitlistGuide(
  id: string,
  markdown: string
): Promise<Result<{ token: string }>> {
  const session = await auth();
  requireStaff(session?.user?.role);

  const entry = await prisma.waitlist.findUnique({
    where: { id },
    select: { guideToken: true, status: true },
  });
  if (!entry) return { ok: false, error: "대기자를 찾을 수 없습니다" };

  const token = entry.guideToken ?? randomUUID();
  await prisma.waitlist.update({
    where: { id },
    data: {
      guideContent: markdown,
      guideToken: token,
      // 아직 대기 상태면 '초대됨'으로 전환 (이미 등원/취소면 상태 유지)
      ...(entry.status === "WAITING" ? { status: "INVITED", invitedAt: new Date() } : {}),
    },
  });
  revalidatePath("/waitlist");
  return { ok: true, data: { token } };
}

/** 공개 등록 안내 조회 (토큰 기반, 인증 불필요). */
export async function getWaitlistGuide(
  token: string
): Promise<{ name: string; branchName: string; content: string } | null> {
  if (!token) return null;
  const entry = await prisma.waitlist.findUnique({
    where: { guideToken: token },
    include: { branch: { select: { name: true } } },
  });
  if (!entry || !entry.guideContent) return null;
  return { name: entry.name, branchName: entry.branch.name, content: entry.guideContent };
}

export async function createProgram(branchId: string, name: string): Promise<Result> {
  const session = await auth();
  requireStaff(session?.user?.role);
  if (!name?.trim()) return { ok: false, error: "프로그램명을 입력해주세요" };

  await prisma.waitlistProgram.create({ data: { branchId, name: name.trim() } });
  revalidatePath("/waitlist");
  return { ok: true };
}

export async function toggleProgram(id: string, isActive: boolean): Promise<Result> {
  const session = await auth();
  requireStaff(session?.user?.role);

  await prisma.waitlistProgram.update({ where: { id }, data: { isActive } });
  revalidatePath("/waitlist");
  return { ok: true };
}

export async function updateProgram(
  id: string,
  data: { name?: string; capacity?: number | null }
): Promise<Result> {
  const session = await auth();
  requireStaff(session?.user?.role);
  if (data.name !== undefined && !data.name.trim()) {
    return { ok: false, error: "프로그램명을 입력해주세요" };
  }

  await prisma.waitlistProgram.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
    },
  });
  revalidatePath("/waitlist");
  return { ok: true };
}
