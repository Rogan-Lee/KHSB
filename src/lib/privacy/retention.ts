import type { Prisma } from "@/generated/prisma";
import { bumpAccessRev } from "@/lib/access-control/store";
import { deleteBlobFiles, isDeletableBlobUrl } from "@/lib/blob-store";
import { prisma } from "@/lib/prisma";
import { lockTuitionStudent, TUITION_TX } from "@/lib/tuition/lock";

// 처리방침 제3조 보유 기간이 지난 정보를 매일 세고 '지울 수 있는 것'을 지운다.
// 급히 멈춰야 하면 RETENTION_PURGE=0 (건수만 센다).
// 퇴원생 파기는 RETENTION_PURGE_STUDENTS=1 일 때만 (기본 꺼짐, RETENTION_PURGE=0 이면 함께 멈춘다).

export const RETENTION = {
  /** 대기 신청·상담 문의: 취소하거나 상담이 끝난 날부터 */
  waitlistDays: 365,
  /** 휴대폰 본인 확인 기록 */
  phoneVerificationDays: 30,
  /** 독서실 이용 기록: 이용 계약이 끝난 날부터 */
  studentYears: 3,
  /** 직원 접속 기록·AI 전송 이력 (상담 기록에 건강 정보가 섞일 수 있어 2년 — 안전성 확보조치 기준 제8조) */
  logYears: 2,
  /** 학생·학부모에게 보낸 앱 알림·문자 발송 기록 (MessageLog) */
  messageLogYears: 1,
  /** 와이파이에 붙었다가 주인을 정하지 않은 기기: 마지막으로 보인 날부터 */
  unassignedDeviceDays: 30,
} as const;

/** 한 번 실행에 파기하는 학생 수 — 크론 60초 안에 끝나게 */
export const STUDENT_PURGE_BATCH = 20;
/** 수납 기록 때문에 남긴 익명 학생 행의 이름. 이 이름이면 이미 파기한 학생이다 */
export const PURGED_STUDENT_NAME = "파기된 학생";
const LEFT_STATUSES = ["WITHDRAWN", "GRADUATED"] as const;

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
    messageLog: yearsAgo(RETENTION.messageLogYears),
    unassignedDevice: daysAgo(RETENTION.unassignedDeviceDays),
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
  return { status: { in: [...LEFT_STATUSES] }, endDate: { lt: cutoff }, NOT: { name: PURGED_STUDENT_NAME } };
}

/** 지우기 직전에 한 번 더 — 쿼리 조건이 잘못돼도 재원·휴원생은 여기서 막힌다 */
export function isExpiredStudent(s: { status: string; endDate: Date | null; name: string }, cutoff: Date): boolean {
  return (
    (s.status === "WITHDRAWN" || s.status === "GRADUATED") &&
    s.endDate !== null &&
    s.endDate.getTime() < cutoff.getTime() &&
    s.name !== PURGED_STUDENT_NAME
  );
}

/** 퇴원·졸업생에게 연결된 기기 (학생 행이 지워져 주인이 빈 채 남은 기기 포함). 통제 제외(EXEMPT)는 대상이 아니다 */
const LEFT_STUDENT_DEVICE_WHERE: Prisma.AccessDeviceWhereInput = {
  status: "ASSIGNED",
  OR: [{ studentId: null }, { student: { status: { in: [...LEFT_STATUSES] } } }],
};
const UNASSIGN_DEVICE = { studentId: null, status: "UNASSIGNED", label: null } as const;

export function staleDeviceWhere(cutoff: Date): Prisma.AccessDeviceWhereInput {
  return { status: "UNASSIGNED", lastSeenAt: { lt: cutoff } };
}

// ─── 학생 파일 ───────────────────────────────────────────────────────

/** 앱이 올린 Vercel Blob 파일 주소인지 (공개·비공개 저장소) */
export function isBlobUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

const BLOB_URL_IN_TEXT = /https:\/\/[a-z0-9-]+\.(?:public|private)\.blob\.vercel-storage\.com\/[^\s"'<>)\\]+/gi;
/** 비공개 저장소 파일은 DB 에 `/api/files/<경로>` 로 저장된다 (blob-store) */
const STORED_FILE_IN_TEXT = /\/api\/files\/[^\s"'<>)\\?#]+/g;

/** 레코드 전체를 훑어 Blob 주소를 모은다 — 주소 칸은 그대로, 글(상담·리포트 본문에 넣은 이미지)에서는 찾아서 */
export function collectBlobUrls(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (!/\s/.test(value) && (isBlobUrl(value) || isDeletableBlobUrl(value))) out.add(value);
    else {
      for (const m of value.matchAll(BLOB_URL_IN_TEXT)) out.add(m[0]);
      for (const m of value.matchAll(STORED_FILE_IN_TEXT)) out.add(m[0]);
    }
  } else if (Array.isArray(value)) {
    for (const v of value) collectBlobUrls(v, out);
  } else if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const v of Object.values(value)) collectBlobUrls(v, out);
  }
  return out;
}

// 파일 주소가 들어가는 곳: 스키마의 url·images·files·attachments 칸과, 이미지를 넣을 수 있는 글(멘토링·상담·월간 리포트)
const STUDENT_FILES = {
  authIdentity: { select: { image: true } },
  photos: { select: { url: true, thumbnailUrl: true } },
  mentorings: { include: { photos: { select: { url: true, thumbnailUrl: true } } } },
  consultations: true,
  monthlyReports: true,
  parentReports: true,
  studyPlanReports: { select: { images: true } },
  onlineParentReports: { select: { content: true } },
  assignments: { select: { files: { select: { url: true } } } },
  mentoringSessions: { select: { photos: { select: { url: true, thumbnailUrl: true } } } },
  performanceTasks: {
    select: { submissions: { select: { files: true, feedbacks: { select: { files: true } } } }, result: { select: { finalFiles: true } } },
  },
  portalChats: { select: { messages: { select: { attachments: true } } } },
  studentQuestions: { select: { messages: { select: { attachments: true } } } },
  familyChat: { select: { messages: { select: { attachments: true } } } },
} satisfies Prisma.StudentInclude;

/**
 * 학생 한 명을 파기한다. 학생 행을 지우면 출결·상담·멘토링·리포트·톡방·통제 규칙 등은 DB 가 함께 지운다(Cascade).
 * 수강료 청구서는 Restrict 라 막히므로, 수납 기록(세법상 5년)이 있으면 이름·연락처 없는 새 학생 행으로 옮기고 원래 행을 지운다.
 * ponytail: 원래 행을 고쳐 쓰지 않고 새 행으로 옮기는 건, 개인 칸·관계가 늘어도 빠뜨리지 않게 하려는 것 (id 는 바뀐다)
 */
async function purgeStudent(id: string, cutoff: Date): Promise<boolean> {
  const s = await prisma.student.findFirst({ where: { id, ...expiredStudentWhere(cutoff) }, include: STUDENT_FILES });
  if (!s || !isExpiredStudent(s, cutoff)) return false;

  // 파일 먼저 — 실패하면 기록을 지우지 않고 다음 실행에 다시 (기록부터 지우면 파일 주소를 다시 찾을 수 없다)
  const urls = [...collectBlobUrls(s)];
  for (let i = 0; i < urls.length; i += 100) {
    await deleteBlobFiles(urls.slice(i, i + 100)); // 공개 URL 은 공개 토큰, /api/files 는 비공개 토큰으로
  }
  const reportIds = [...s.monthlyReports, ...s.parentReports].map((r) => r.id);

  await prisma.$transaction(async (tx) => {
    await lockTuitionStudent(tx, id);
    // 학생 행을 지워도 남는 것(SetNull·id 스냅샷)
    await tx.photo.deleteMany({ where: { OR: [{ studentId: id }, { mentoring: { studentId: id } }] } });
    await tx.calendarEvent.deleteMany({ where: { studentId: id } });
    await tx.monthlyNote.deleteMany({ where: { studentId: id } });
    await tx.waitlist.deleteMany({ where: { studentId: id } });
    await tx.accessEvent.deleteMany({ where: { studentId: id } });
    await tx.accessDevice.updateMany({ where: { studentId: id }, data: UNASSIGN_DEVICE });
    if (reportIds.length > 0) await tx.reportAiJob.deleteMany({ where: { targetId: { in: reportIds } } });

    if ((await tx.tuitionInvoice.count({ where: { studentId: id } })) > 0) {
      const anon = await tx.student.create({
        data: { name: PURGED_STUDENT_NAME, parentPhone: "", grade: "", status: s.status, startDate: s.startDate, endDate: s.endDate },
        select: { id: true },
      });
      await tx.tuitionInvoice.updateMany({ where: { studentId: id }, data: { studentId: anon.id } });
    }
    const { count } = await tx.student.deleteMany({ where: { id, ...expiredStudentWhere(cutoff) } });
    if (count !== 1) throw new Error("파기 대상이 아닌 학생입니다");
  }, TUITION_TX);
  return true;
}

export type RetentionPreview = {
  checkedAt: string;
  waitlist: number;
  phoneVerification: number;
  logs: number;
  /** 발송 기록(1년) */
  messages: number;
  /** 지울 때가 된 학생 — 그중 수납 기록(5년 보존)이 있으면 수납 기록만 이름 없이 남긴다 */
  students: number;
  studentsHeldByPayment: number;
  /** 퇴원했는데 종료일이 없어 기간을 셀 수 없는 학생 */
  studentsWithoutEndDate: number;
  /** 학생 파기가 켜져 있는지 (RETENTION_PURGE_STUDENTS=1 이고 RETENTION_PURGE 가 0 이 아님) */
  studentPurgeEnabled: boolean;
  /** 파기했지만 수납 기록 때문에 남긴 익명 학생 행 */
  studentsAnonymized: number;
  /** 와이파이 기기 — 퇴원·졸업생에게 연결된 기기 / 오래 안 보인 미배정 기기 */
  devicesToUnassign: number;
  devicesStale: number;
  purged: {
    waitlist: number;
    phoneVerification: number;
    logs: number;
    messages: number;
    devicesUnassigned: number;
    devicesDeleted: number;
    students: number;
  } | null;
};

export async function runRetention(now = new Date()): Promise<RetentionPreview> {
  const cut = retentionCutoffs(now);
  const studentWhere = expiredStudentWhere(cut.student);
  const purgeOn = process.env.RETENTION_PURGE !== "0";
  const studentPurgeEnabled = purgeOn && process.env.RETENTION_PURGE_STUDENTS === "1";
  const [
    waitlist,
    phoneVerification,
    accessLogs,
    aiLogs,
    messages,
    students,
    studentsHeldByPayment,
    studentsWithoutEndDate,
    studentsAnonymized,
    devicesToUnassign,
    devicesStale,
  ] = await Promise.all([
    prisma.waitlist.count({ where: expiredWaitlistWhere(cut.waitlist) }),
    prisma.phoneVerification.count({ where: { createdAt: { lt: cut.phoneVerification } } }),
    prisma.personalDataAccessLog.count({ where: { createdAt: { lt: cut.log } } }),
    prisma.aiTransferLog.count({ where: { createdAt: { lt: cut.log } } }),
    prisma.messageLog.count({ where: { sentAt: { lt: cut.messageLog } } }),
    prisma.student.count({ where: studentWhere }),
    prisma.student.count({ where: { ...studentWhere, tuitionInvoices: { some: {} } } }),
    prisma.student.count({ where: { status: { in: [...LEFT_STATUSES] }, endDate: null } }),
    prisma.student.count({ where: { name: PURGED_STUDENT_NAME } }),
    prisma.accessDevice.count({ where: LEFT_STUDENT_DEVICE_WHERE }),
    prisma.accessDevice.count({ where: staleDeviceWhere(cut.unassignedDevice) }),
  ]);

  let purged: RetentionPreview["purged"] = null;
  if (purgeOn) {
    const [w, p, a, t, m, du, dd] = await prisma.$transaction([
      prisma.waitlist.deleteMany({ where: expiredWaitlistWhere(cut.waitlist) }),
      prisma.phoneVerification.deleteMany({ where: { createdAt: { lt: cut.phoneVerification } } }),
      prisma.personalDataAccessLog.deleteMany({ where: { createdAt: { lt: cut.log } } }),
      prisma.aiTransferLog.deleteMany({ where: { createdAt: { lt: cut.log } } }),
      prisma.messageLog.deleteMany({ where: { sentAt: { lt: cut.messageLog } } }),
      // 와이파이 기기: 퇴원생 기기는 연결을 풀고, 그 뒤 오래 안 보인 미배정 기기를 지운다 (직원·공용 EXEMPT 는 그대로)
      prisma.accessDevice.updateMany({ where: LEFT_STUDENT_DEVICE_WHERE, data: UNASSIGN_DEVICE }),
      prisma.accessDevice.deleteMany({ where: staleDeviceWhere(cut.unassignedDevice) }),
    ]);

    let purgedStudents = 0;
    if (studentPurgeEnabled) {
      const targets = await prisma.student.findMany({
        where: studentWhere,
        select: { id: true },
        orderBy: { endDate: "asc" },
        take: STUDENT_PURGE_BATCH,
      });
      for (const { id } of targets) {
        try {
          if (await purgeStudent(id, cut.student)) purgedStudents++;
        } catch (e) {
          console.error("[retention] 학생 파기 실패", id, e);
        }
      }
    }
    // 기기 연결·학생별 통제 규칙이 바뀌었으면 장비가 정책을 다시 받게
    if (du.count + dd.count + purgedStudents > 0) await bumpAccessRev();
    purged = {
      waitlist: w.count,
      phoneVerification: p.count,
      logs: a.count + t.count,
      messages: m.count,
      devicesUnassigned: du.count,
      devicesDeleted: dd.count,
      students: purgedStudents,
    };
  }

  const preview: RetentionPreview = {
    checkedAt: now.toISOString(),
    waitlist,
    phoneVerification,
    logs: accessLogs + aiLogs,
    messages,
    students,
    studentsHeldByPayment,
    studentsWithoutEndDate,
    studentPurgeEnabled,
    studentsAnonymized,
    devicesToUnassign,
    devicesStale,
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
