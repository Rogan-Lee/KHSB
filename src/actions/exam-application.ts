"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { notifySlack } from "@/lib/slack";
import { todayKST } from "@/lib/utils";
import { normalizeMobile, phonesMatch } from "@/lib/phone";
import { ExamApplicationStatus } from "@/generated/prisma";
import { assignExamSeatsRandomly } from "@/actions/exam-sessions";

// ─────────────────────────── 학생/학부모 (매직링크 토큰 인증) ───────────────────────────

/**
 * 모의고사 신청(또는 재신청). 세션이 신청 접수중(applicationOpen)이고 시험일이 지나지 않아야 함.
 * 이미 신청 이력이 있으면(취소/반려 포함) PENDING 으로 되돌려 재접수.
 */
export async function submitExamApplication(token: string, sessionId: string, memo?: string) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");
  const studentId = session.student.id;

  const exam = await prisma.examSession.findUnique({ where: { id: sessionId } });
  if (!exam) throw new Error("시험을 찾을 수 없습니다");
  if (!exam.applicationOpen || exam.examDate < todayKST()) {
    throw new Error("신청이 마감된 시험입니다");
  }

  const trimmed = memo?.trim() || null;
  await prisma.examApplication.upsert({
    where: { sessionId_studentId: { sessionId, studentId } },
    update: { status: "PENDING", memo: trimmed, confirmedAt: null, confirmedById: null },
    create: { sessionId, studentId, memo: trimmed },
  });

  notifySlack(`📝 [모의고사 신청] ${session.student.name} 학생이 "${exam.title}" 신청했습니다.`);
  revalidatePath(`/exams/${sessionId}`);
  return { ok: true };
}

/** 학생/학부모 본인 신청 철회 — 행 삭제(재신청 가능). */
export async function cancelExamApplication(token: string, sessionId: string) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");
  await prisma.examApplication.deleteMany({
    where: { sessionId, studentId: session.student.id },
  });
  revalidatePath(`/exams/${sessionId}`);
  return { ok: true };
}

// ─────────────────────── 공개 신청 링크 (전화 본인인증, 계정 불필요) ───────────────────────
// 대기신청과 동일한 전화인증(issuePhoneCode/confirmPhoneVerification)을 재사용.
// 직원이 /exam-apply/[sessionId] 링크만 뿌리면, 학생/학부모가 본인인증 후 신청.

const SUBMIT_WINDOW_MS = 10 * 60 * 1000; // 인증 완료 후 제출 허용 시간 (waitlist와 동일)
type PublicResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/** 인증 완료된 번호인지 확인 후, 그 번호와 매칭되는 ACTIVE 학생만 반환. */
async function verifiedStudents(phone: string) {
  const verified = await prisma.phoneVerification.findFirst({
    where: { phone, verifiedAt: { gt: new Date(Date.now() - SUBMIT_WINDOW_MS) } },
  });
  if (!verified) return null; // 인증 미완료

  // 저장 형식(하이픈 유무)이 제각각이라 DB where 대신 JS 매칭. 단일 시설 규모(수백 명)라 부담 없음.
  // ponytail: 전 학생 스캔. 학생 수가 수천 이상이면 정규화 컬럼+인덱스로 전환.
  const all = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, grade: true, phone: true, parentPhone: true },
  });
  return all.filter((s) => phonesMatch(s.phone, phone) || phonesMatch(s.parentPhone, phone));
}

/** 인증된 휴대폰으로 신청 가능한 학생 목록 조회 (공개 신청 화면). */
export async function findStudentsByVerifiedPhone(
  sessionId: string,
  rawPhone: string
): Promise<PublicResult<{ students: { id: string; name: string; grade: string; status: ExamApplicationStatus | null }[] }>> {
  const phone = normalizeMobile(rawPhone);
  if (!phone) return { ok: false, error: "올바른 휴대폰 번호를 입력해주세요" };

  const students = await verifiedStudents(phone);
  if (!students) return { ok: false, error: "휴대폰 본인인증을 먼저 완료해주세요" };

  const applied = await prisma.examApplication.findMany({
    where: { sessionId, studentId: { in: students.map((s) => s.id) } },
    select: { studentId: true, status: true },
  });
  const statusOf = new Map(applied.map((a) => [a.studentId, a.status]));
  return {
    ok: true,
    data: {
      students: students.map((s) => ({
        id: s.id,
        name: s.name,
        grade: s.grade,
        status: statusOf.get(s.id) ?? null,
      })),
    },
  };
}

/** 공개 신청 제출 — 본인인증 + studentId가 그 번호에 실제로 매칭되는지 재검증 후 접수. */
export async function submitExamApplicationPublic(
  sessionId: string,
  rawPhone: string,
  studentId: string,
  memo?: string
): Promise<PublicResult<{ studentName: string }>> {
  const phone = normalizeMobile(rawPhone);
  if (!phone) return { ok: false, error: "올바른 휴대폰 번호를 입력해주세요" };

  // 신뢰 경계: 인증된 번호 + 그 번호에 매칭되는 학생만 신청 가능 (임의 studentId 차단).
  const students = await verifiedStudents(phone);
  if (!students) return { ok: false, error: "휴대폰 본인인증을 먼저 완료해주세요" };
  const student = students.find((s) => s.id === studentId);
  if (!student) return { ok: false, error: "본인인증한 번호와 학생 정보가 일치하지 않습니다" };

  const exam = await prisma.examSession.findUnique({ where: { id: sessionId } });
  if (!exam) return { ok: false, error: "시험을 찾을 수 없습니다" };
  if (!exam.applicationOpen || exam.examDate < todayKST()) {
    return { ok: false, error: "신청이 마감된 시험입니다" };
  }

  const trimmed = memo?.trim() || null;
  await prisma.examApplication.upsert({
    where: { sessionId_studentId: { sessionId, studentId } },
    update: { status: "PENDING", memo: trimmed, confirmedAt: null, confirmedById: null },
    create: { sessionId, studentId, memo: trimmed },
  });

  notifySlack(`📝 [모의고사 신청] ${student.name} 학생이 "${exam.title}" 신청했습니다. (공개 링크)`);
  revalidatePath(`/exams/${sessionId}`);
  return { ok: true, data: { studentName: student.name } };
}

/** 공개 자가취소 — 본인인증 + studentId 매칭 검증 후 신청 삭제(재신청 가능). */
export async function cancelExamApplicationPublic(
  sessionId: string,
  rawPhone: string,
  studentId: string
): Promise<PublicResult> {
  const phone = normalizeMobile(rawPhone);
  if (!phone) return { ok: false, error: "올바른 휴대폰 번호를 입력해주세요" };

  const students = await verifiedStudents(phone);
  if (!students) return { ok: false, error: "휴대폰 본인인증을 먼저 완료해주세요" };
  if (!students.some((s) => s.id === studentId)) {
    return { ok: false, error: "본인인증한 번호와 학생 정보가 일치하지 않습니다" };
  }

  await prisma.examApplication.deleteMany({ where: { sessionId, studentId } });
  revalidatePath(`/exams/${sessionId}`);
  return { ok: true };
}

// ─────────────────────────── 운영진 (requireStaff) ───────────────────────────

/** 신청 접수 열기/닫기 토글. */
export async function toggleExamApplicationOpen(sessionId: string, open: boolean) {
  const s = await auth();
  requireStaff(s?.user?.role);
  await prisma.examSession.update({ where: { id: sessionId }, data: { applicationOpen: open } });
  revalidatePath(`/exams/${sessionId}`);
}

/** 신청 상태 변경 — 확정(CONFIRMED) / 반려(CANCELLED) / 대기(PENDING). */
export async function setExamApplicationStatus(id: string, status: ExamApplicationStatus) {
  const s = await auth();
  requireStaff(s?.user?.role);
  const app = await prisma.examApplication.update({
    where: { id },
    data: {
      status,
      confirmedAt: status === "CONFIRMED" ? new Date() : null,
      confirmedById: status === "CONFIRMED" ? s!.user.id : null,
    },
    select: { sessionId: true },
  });
  revalidatePath(`/exams/${app.sessionId}`);
}

/**
 * 확정(CONFIRMED)된 신청자들을 기존 좌석 자동배정 로직으로 넘긴다.
 * 좌석배정은 재발명하지 않고 exam-sessions 의 assignExamSeatsRandomly 를 그대로 호출.
 */
export async function assignSeatsFromConfirmedApplications(sessionId: string) {
  const s = await auth();
  requireStaff(s?.user?.role);
  const confirmed = await prisma.examApplication.findMany({
    where: { sessionId, status: "CONFIRMED" },
    select: { studentId: true },
  });
  if (confirmed.length === 0) throw new Error("확정된 신청자가 없습니다");
  await assignExamSeatsRandomly(sessionId, confirmed.map((c) => c.studentId));
  return { count: confirmed.length };
}
