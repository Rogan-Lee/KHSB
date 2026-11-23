import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

// 처리방침 제3조 보유 기간이 지난 정보. 기본은 미리보기(건수만 세어 기록)이고,
// RETENTION_PURGE=1 일 때만 '지울 수 있는 것'을 지운다.

export const RETENTION = {
  /** 대기 신청·상담 문의: 취소하거나 상담이 끝난 날부터 */
  waitlistDays: 365,
  /** 휴대폰 본인 확인 기록 */
  phoneVerificationDays: 30,
  /** 독서실 이용 기록: 이용 계약이 끝난 날부터 */
  studentYears: 3,
  /** 직원 접속 기록·AI 전송 이력 (상담 기록에 건강 정보가 섞일 수 있어 2년 — 안전성 확보조치 기준 제8조) */
  logYears: 2,
} as const;

const PREVIEW_KEY = "retention.preview";

export function retentionCutoffs(now = new Date()) {
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const yearsAgo = (n: number) => {
    const d = new Date(now);
    d.setUTCFullYear(d.getUTCFullYear() - n);
    return d;
  };
  return {
    waitlist: daysAgo(RETENTION.waitlistDays),
    phoneVerification: daysAgo(RETENTION.phoneVerificationDays),
    student: yearsAgo(RETENTION.studentYears),
    log: yearsAgo(RETENTION.logYears),
  };
}

/** 취소한 신청과, 응대가 끝난 문의. 학생으로 등록된 신청은 학생 등록 정보라 여기서 빼고, 응대 전(WAITING)도 뺀다 */
export function expiredWaitlistWhere(cutoff: Date): Prisma.WaitlistWhereInput {
  return {
    studentId: null,
    OR: [
      { status: "CANCELLED", cancelledAt: { lt: cutoff } },
      { status: "CANCELLED", cancelledAt: null, updatedAt: { lt: cutoff } },
      { kind: "INQUIRY", status: { in: ["INVITED", "ENROLLED"] }, updatedAt: { lt: cutoff } },
    ],
  };
}

/** 퇴원·졸업하고 이용이 끝난 날이 지난 학생. 종료일이 비어 있으면 기간을 알 수 없어 대상이 아니다 */
export function expiredStudentWhere(cutoff: Date): Prisma.StudentWhereInput {
  return { status: { in: ["WITHDRAWN", "GRADUATED"] }, endDate: { lt: cutoff } };
}

export type RetentionPreview = {
  checkedAt: string;
  waitlist: number;
  phoneVerification: number;
  logs: number;
  /** 지울 때가 된 학생 — 수납 기록(5년 보존)이 있으면 held */
  students: number;
  studentsHeldByPayment: number;
  /** 퇴원했는데 종료일이 없어 기간을 셀 수 없는 학생 */
  studentsWithoutEndDate: number;
  purged: { waitlist: number; phoneVerification: number; logs: number } | null;
};

export async function runRetention(now = new Date()): Promise<RetentionPreview> {
  const cut = retentionCutoffs(now);
  const studentWhere = expiredStudentWhere(cut.student);
  const [waitlist, phoneVerification, accessLogs, aiLogs, students, studentsHeldByPayment, studentsWithoutEndDate] = await Promise.all([
    prisma.waitlist.count({ where: expiredWaitlistWhere(cut.waitlist) }),
    prisma.phoneVerification.count({ where: { createdAt: { lt: cut.phoneVerification } } }),
    prisma.personalDataAccessLog.count({ where: { createdAt: { lt: cut.log } } }),
    prisma.aiTransferLog.count({ where: { createdAt: { lt: cut.log } } }),
    prisma.student.count({ where: studentWhere }),
    prisma.student.count({ where: { ...studentWhere, tuitionInvoices: { some: {} } } }),
    prisma.student.count({ where: { status: { in: ["WITHDRAWN", "GRADUATED"] }, endDate: null } }),
  ]);

  let purged: RetentionPreview["purged"] = null;
  if (process.env.RETENTION_PURGE === "1") {
    // ponytail: 학생 파기는 하지 않는다 — 첨부 파일(Blob)이 여러 표에 흩어져 있어 함께 지우는 절차가 먼저 필요하다.
    // 첫 대상이 2029년이라 그 전에 만든다.
    const [w, p, a, t] = await prisma.$transaction([
      prisma.waitlist.deleteMany({ where: expiredWaitlistWhere(cut.waitlist) }),
      prisma.phoneVerification.deleteMany({ where: { createdAt: { lt: cut.phoneVerification } } }),
      prisma.personalDataAccessLog.deleteMany({ where: { createdAt: { lt: cut.log } } }),
      prisma.aiTransferLog.deleteMany({ where: { createdAt: { lt: cut.log } } }),
    ]);
    purged = { waitlist: w.count, phoneVerification: p.count, logs: a.count + t.count };
  }

  const preview: RetentionPreview = {
    checkedAt: now.toISOString(),
    waitlist,
    phoneVerification,
    logs: accessLogs + aiLogs,
    students,
    studentsHeldByPayment,
    studentsWithoutEndDate,
    purged,
  };
  const value = JSON.stringify(preview);
  await prisma.appSetting.upsert({ where: { key: PREVIEW_KEY }, create: { key: PREVIEW_KEY, value }, update: { value } });
  return preview;
}

export async function getRetentionPreview(): Promise<RetentionPreview | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: PREVIEW_KEY }, select: { value: true } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as RetentionPreview;
  } catch {
    return null;
  }
}
