"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { randomInt, randomUUID } from "node:crypto";
import { checkMessageExists, createSmsQrCode, OCTOMO_RECEIVER } from "@/lib/octomo";
import { grantGatePass, hasGatePass } from "@/lib/token-auth";
import { createOpaqueToken } from "@/lib/auth-tokens";
import type {
  BranchWaitStatus,
  WaitGender,
  WaitGradeType,
  WaitlistStatus,
  WaitlistKind,
} from "@/generated/prisma/enums";

const CODE_TTL_MS = 5 * 60 * 1000; // 5분 (Octomo exists 조회 기준과 동일)
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10분
const SUBMIT_WINDOW_MS = 10 * 60 * 1000; // 인증 완료 후 제출 허용 시간
const MAX_ISSUES_PER_WINDOW = 5;
const MAX_VERIFY_ATTEMPTS = 10; // MO는 유저가 보낸 뒤 폴링이라 시도 여유
const MAX_UNVERIFIED_INQUIRIES_PER_WINDOW = 3; // 미인증 문의 — 번호당 10분 내 접수 상한

// 공개 폼 입력 길이 상한
const NAME_MAX = 50;
const SCHOOL_MAX = 50;
const GRADE_MAX = 20;
const NOTE_MAX = 2000;

const WAIT_GENDERS: readonly string[] = ["MALE", "FEMALE"];
const WAIT_GRADE_TYPES: readonly string[] = ["REPEAT", "ENROLLED"];
const WAITLIST_KINDS: readonly string[] = ["WAITLIST", "INQUIRY"];

// ─── 전화 인증 ↔ 브라우저 결속 ───
// 인증 기록(PhoneVerification)은 번호 단위라, 결속이 없으면 남의 번호를 아는 사람이
// (1) 피해자가 문자를 보낸 직후 먼저 "보냈어요"를 눌러 인증을 가로채거나
// (2) 피해자 인증 후 10분 안에 findExistingByPhone 으로 신청 내역(이름·학교·토큰)을 조회할 수 있다.
// 발급·인증 시 HMAC 쿠키(token-auth 게이트 쿠키 재사용)를 심고, 이후 단계는 같은 브라우저만 허용한다.
function issueGateKey(phone: string) {
  return `waitlist-phone-issue:${phone}`;
}
function verifiedGateKey(phone: string) {
  return `waitlist-phone-verified:${phone}`;
}
async function safeHasGatePass(key: string, subjectId: string): Promise<boolean> {
  try {
    return await hasGatePass("PARENT", key, subjectId);
  } catch {
    return false;
  }
}

/** 이 브라우저에서 인증을 완료한, 제출 허용 시간 내의 인증 기록 (없으면 null) */
async function findBoundVerification(phone: string) {
  const verified = await prisma.phoneVerification.findFirst({
    where: { phone, verifiedAt: { gt: new Date(Date.now() - SUBMIT_WINDOW_MS) } },
    orderBy: { verifiedAt: "desc" },
  });
  if (!verified) return null;
  return (await safeHasGatePass(verifiedGateKey(phone), verified.id)) ? verified : null;
}

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/** 휴대폰 번호 정규화 — 숫자만. 한국 휴대폰(010, 11자리)만 허용. */
function normalizePhone(raw: string): string | null {
  const digits = (typeof raw === "string" ? raw : "").replace(/\D/g, "");
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

  const code = String(randomInt(100000, 1000000)); // 6자리
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  const verification = await prisma.phoneVerification.create({
    data: { phone, code, expiresAt },
    select: { id: true },
  });
  // 발급한 브라우저에만 "보냈어요"(confirm) 허용
  await grantGatePass("PARENT", issueGateKey(phone), verification.id, expiresAt);

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

  // 이 브라우저가 발급한 미인증 코드만 대상 (제3자가 같은 번호로 발급한 건 무시 — 가로채기·방해 방지)
  const pending = await prisma.phoneVerification.findMany({
    where: { phone, verifiedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: MAX_ISSUES_PER_WINDOW,
  });
  let verification: (typeof pending)[number] | null = null;
  for (const v of pending) {
    if (await safeHasGatePass(issueGateKey(phone), v.id)) {
      verification = v;
      break;
    }
  }
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
      error: `아직 문자 수신이 확인되지 않았어요. 화면의 인증번호를 ${OCTOMO_RECEIVER}로 보낸 뒤 다시 눌러주세요`,
    };
  }

  const verifiedAt = new Date();
  await prisma.phoneVerification.update({
    where: { id: verification.id },
    data: { verifiedAt },
  });
  // 인증을 완료한 브라우저에만 제출·내역 조회 허용 (제출 허용 시간과 동일하게 만료)
  await grantGatePass(
    "PARENT",
    verifiedGateKey(phone),
    verification.id,
    new Date(verifiedAt.getTime() + SUBMIT_WINDOW_MS),
  );
  return { ok: true };
}

export type WaitlistSubmitInput = {
  branchId: string;
  programId?: string | null;
  name: string;
  school?: string | null;
  grade?: string | null;
  phone: string;
  gender?: WaitGender | null;
  gradeType?: WaitGradeType | null;
  kind?: WaitlistKind;
  entryPreference?: string | null; // "winter" | "immediate" | null
  note?: string;
  consentMarketing?: boolean;
};

/**
 * 대기 등록 — 대기 신청(WAITLIST)은 본인인증(confirmPhoneVerification) 완료가 전제.
 * 단순 문의(INQUIRY)는 인증 없이도 접수 가능 (관리자 화면에 "미인증" 표시).
 * 성공 시 상태 페이지 토큰 반환.
 */
export async function submitWaitlist(
  input: WaitlistSubmitInput
): Promise<Result<{ token: string }>> {
  if (!input || typeof input !== "object") return { ok: false, error: "잘못된 요청입니다" };
  const kind = input.kind ?? "WAITLIST";
  if (!WAITLIST_KINDS.includes(kind)) return { ok: false, error: "잘못된 요청입니다" };
  if (typeof input.phone !== "string" || typeof input.name !== "string") {
    return { ok: false, error: "잘못된 요청입니다" };
  }
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, error: "올바른 휴대폰 번호를 입력해주세요" };
  if (!input.name?.trim()) return { ok: false, error: "이름을 입력해주세요" };
  // 공개 폼 — 길이·형식 제한 (DB 스팸/비정상 입력 방지)
  const tooLong = (v: unknown, max: number) => v != null && (typeof v !== "string" || v.length > max);
  if (
    tooLong(input.name, NAME_MAX) ||
    tooLong(input.school, SCHOOL_MAX) ||
    tooLong(input.grade, GRADE_MAX) ||
    tooLong(input.note, NOTE_MAX)
  ) {
    return { ok: false, error: "입력 길이를 확인해주세요" };
  }
  if (input.gender != null && !WAIT_GENDERS.includes(input.gender)) {
    return { ok: false, error: "성별을 다시 선택해주세요" };
  }
  if (input.gradeType != null && !WAIT_GRADE_TYPES.includes(input.gradeType)) {
    return { ok: false, error: "학년을 다시 선택해주세요" };
  }
  if (input.programId != null && typeof input.programId !== "string") {
    return { ok: false, error: "잘못된 요청입니다" };
  }
  // 대기 신청만 성별/학년 필수. 문의는 생략 가능.
  if (kind === "WAITLIST" && (!input.gender || !input.gradeType)) {
    return { ok: false, error: "성별과 학년을 선택해주세요" };
  }

  // 입실 희망 옵션(선택) — 허용값 외에는 미선택 처리
  const entryPreference =
    input.entryPreference === "winter" || input.entryPreference === "immediate"
      ? input.entryPreference
      : null;

  // 최근 인증 완료된 레코드 확인 (이 브라우저에서 인증한 것만) — 대기 신청만 필수, 문의는 미인증 허용
  const verified = await findBoundVerification(phone);
  if (!verified && kind === "WAITLIST") {
    return { ok: false, error: "휴대폰 본인인증을 먼저 완료해주세요" };
  }
  if (!verified) {
    // 미인증 문의는 번호당 접수 횟수 제한 (무인증 공개 엔드포인트 스팸 방지)
    const recentInquiries = await prisma.waitlist.count({
      where: {
        phone,
        kind: "INQUIRY",
        phoneVerifiedAt: null,
        createdAt: { gt: new Date(Date.now() - RATE_WINDOW_MS) },
      },
    });
    if (recentInquiries >= MAX_UNVERIFIED_INQUIRIES_PER_WINDOW) {
      return { ok: false, error: "잠시 후 다시 시도해주세요 (접수 횟수 초과)" };
    }
  }

  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, isActive: true },
  });
  if (!branch) return { ok: false, error: "선택한 지점을 찾을 수 없습니다" };
  // 마감 지점은 대기 신청만 차단. 문의는 허용.
  if (kind === "WAITLIST" && branch.waitStatus === "CLOSED") {
    return { ok: false, error: "해당 지점은 현재 신청을 받지 않습니다" };
  }

  // 프로그램은 해당 지점의 활성 프로그램만 허용
  const programId = kind === "WAITLIST" ? input.programId || null : null;
  if (programId) {
    const program = await prisma.waitlistProgram.findFirst({
      where: { id: programId, branchId: branch.id, isActive: true },
      select: { id: true },
    });
    if (!program) return { ok: false, error: "선택한 프로그램을 찾을 수 없습니다" };
  }

  const entry = await prisma.waitlist.create({
    data: {
      // 상태 페이지 공개 토큰 — 스키마 기본값(cuid) 대신 CSPRNG 로 발급
      token: createOpaqueToken(24),
      branchId: branch.id,
      programId,
      name: input.name.trim(),
      school: input.school?.trim() || null,
      grade: input.grade?.trim() || null,
      phone,
      gender: kind === "WAITLIST" ? input.gender : null,
      gradeType: kind === "WAITLIST" ? input.gradeType : null,
      kind,
      entryPreference: kind === "WAITLIST" ? entryPreference : null,
      note: input.note?.trim() || null,
      consentMarketing: Boolean(input.consentMarketing),
      phoneVerifiedAt: verified?.verifiedAt ?? null,
    },
  });

  return { ok: true, data: { token: entry.token } };
}

export type ExistingEntry = {
  token: string;
  name: string;
  school: string | null;
  grade: string | null;
  branchName: string;
  kind: "WAITLIST" | "INQUIRY";
  status: WaitlistStatus;
  createdAt: string;
};

/**
 * 인증된 휴대폰으로 이미 남긴 활성(미취소) 신청/문의 조회 — 중복 등록 전 확인용.
 * 인증된 폰만 조회 허용(타인 정보 열람 방지).
 */
export async function findExistingByPhone(rawPhone: string): Promise<ExistingEntry[]> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return [];
  // 이 브라우저에서 인증한 번호만 조회 허용 (번호만 아는 제3자의 조회 차단)
  const verified = await findBoundVerification(phone);
  if (!verified) return [];

  const entries = await prisma.waitlist.findMany({
    where: { phone, status: { not: "CANCELLED" } },
    include: { branch: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return entries.map((e) => ({
    token: e.token,
    name: e.name,
    school: e.school,
    grade: e.grade,
    branchName: e.branch.name,
    kind: e.kind,
    status: e.status,
    createdAt: e.createdAt.toISOString(),
  }));
}

export type WaitlistPosition = {
  name: string;
  school: string | null;
  grade: string | null;
  branchName: string;
  gradeType: WaitGradeType | null;
  gender: WaitGender | null;
  status: WaitlistStatus;
  kind: "WAITLIST" | "INQUIRY";
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

  // 순번 = 대기(WAITLIST) WAITING 만 카운트. 단순 문의(INQUIRY)는 줄을 서지 않음.
  const base = {
    branchId: entry.branchId,
    status: "WAITING" as WaitlistStatus,
    kind: "WAITLIST" as const,
    createdAt: { lte: entry.createdAt },
  };
  const inQueue = entry.status === "WAITING" && entry.kind === "WAITLIST";
  const [overall, byGrade] = inQueue
    ? await Promise.all([
        prisma.waitlist.count({ where: base }),
        prisma.waitlist.count({ where: { ...base, gradeType: entry.gradeType } }),
      ])
    : [0, 0];

  return {
    name: entry.name,
    school: entry.school,
    grade: entry.grade,
    branchName: entry.branch.name,
    gradeType: entry.gradeType,
    gender: entry.gender,
    status: entry.status,
    kind: entry.kind,
    createdAt: entry.createdAt,
    overall,
    byGrade,
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

/**
 * 기존 ACTIVE 원생을 프로그램 참여자로 일괄 등록(ENROLLED Waitlist 생성, studentId 연결).
 * 이미 해당 프로그램에 참여 중인 학생은 skip. 정원 집계(등원)에 자동 반영.
 */
export async function bulkEnrollStudents(
  programId: string,
  studentIds: string[]
): Promise<Result<{ added: number; skipped: number }>> {
  const session = await auth();
  requireStaff(session?.user?.role);
  if (!studentIds.length) return { ok: false, error: "학생을 선택해주세요" };

  const program = await prisma.waitlistProgram.findUnique({
    where: { id: programId },
    select: { id: true, branchId: true },
  });
  if (!program) return { ok: false, error: "프로그램을 찾을 수 없습니다" };

  // 이미 이 프로그램에 ENROLLED 인 학생 제외
  const existing = await prisma.waitlist.findMany({
    where: { programId, status: "ENROLLED", studentId: { in: studentIds } },
    select: { studentId: true },
  });
  const already = new Set(existing.map((e) => e.studentId));
  const targets = await prisma.student.findMany({
    where: { id: { in: studentIds.filter((id) => !already.has(id)) }, status: "ACTIVE" },
    select: { id: true, name: true, phone: true, parentPhone: true },
  });

  if (targets.length > 0) {
    await prisma.waitlist.createMany({
      data: targets.map((s) => ({
        branchId: program.branchId,
        programId,
        studentId: s.id,
        name: s.name,
        phone: (s.phone || s.parentPhone || "").replace(/\D/g, ""),
        status: "ENROLLED" as WaitlistStatus,
        enrolledAt: new Date(),
        kind: "WAITLIST" as WaitlistKind,
      })),
    });
  }
  revalidatePath("/waitlist");
  return { ok: true, data: { added: targets.length, skipped: studentIds.length - targets.length } };
}
