// 모바일 직원 현장 운영 — 학생 검색·프로필·학부모 요청/전달사항·좌석 현황.

import { z } from "zod";

import type {
  AttendanceType,
  CommunicationType,
  MentoringStatus,
} from "@/generated/prisma";
import { MobileApiError } from "@/lib/mobile-auth";
import {
  getKstDayContext,
  getStaffMobileAttendance,
  getStaffMobileAttendanceItem,
  getStaffMobileStudentDetail,
  loadAttentionMap,
} from "@/lib/mobile-data";
import { getMeritTotals, serializeMerits } from "@/lib/mobile-staff-ops-merits";
import { prisma } from "@/lib/prisma";
import { getSeatLayoutRooms } from "@/lib/seat-layout";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new MobileApiError(
    result.error.issues[0]?.message ?? "입력값을 확인하세요",
    400,
  );
}

function formatKstTime(value: Date | null) {
  if (!value) return null;
  return value.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ─── 학생 검색 ──────────────────────────────────────────────────────────────

/** 이름·좌석·학교·학년으로 검색 (오프라인 ACTIVE). q 가 비면 전체 — 오늘 출결 상태 포함 */
export async function searchStaffStudents(rawQuery: string | null, now = new Date()) {
  const { items } = await getStaffMobileAttendance(now, { withAttention: true });
  const q = (rawQuery ?? "").trim().toLowerCase();
  if (!q) return { items };

  const filtered = items.filter((s) => {
    const seat = s.seat?.trim().toLowerCase() ?? "";
    return (
      s.name.toLowerCase().includes(q) ||
      seat === q ||
      (seat !== "" && seat.startsWith(q)) ||
      (s.school ?? "").toLowerCase().includes(q) ||
      s.grade.toLowerCase().includes(q)
    );
  });
  return { items: filtered };
}

// ─── 학부모 요청 · 운영진 전달사항 (Communication) ─────────────────────────

const COMMUNICATION_LABEL: Record<CommunicationType, string> = {
  PARENT_REQUEST: "학부모 요청",
  STAFF_NOTE: "운영진 전달",
};

const createCommunicationInput = z.object({
  type: z.enum(["PARENT_REQUEST", "STAFF_NOTE"], { message: "종류를 선택하세요" }),
  content: z
    .string()
    .trim()
    .min(1, "내용을 입력하세요")
    .max(1000, "내용은 1000자까지 쓸 수 있어요"),
});

const patchCommunicationInput = z.object({
  isChecked: z.literal(true, { message: "확인 처리만 할 수 있어요" }),
});

type CommunicationRow = {
  id: string;
  type: CommunicationType;
  content: string;
  isChecked: boolean;
  checkedAt: Date | null;
  createdAt: Date;
  createdByName: string;
};

function serializeCommunication(c: CommunicationRow) {
  return {
    id: c.id,
    type: c.type,
    typeLabel: COMMUNICATION_LABEL[c.type],
    content: c.content,
    isChecked: c.isChecked,
    checkedAt: c.checkedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    createdByName: c.createdByName,
  };
}

export type MobileCommunicationItem = ReturnType<typeof serializeCommunication>;

async function requireActiveStudent(studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!student) throw new MobileApiError("학생을 찾을 수 없습니다", 404);
}

export async function listStudentCommunications(studentId: string) {
  await requireActiveStudent(studentId);
  const rows = await prisma.communication.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return {
    items: rows.map(serializeCommunication),
    unchecked: rows.filter((r) => !r.isChecked).length,
  };
}

export async function createStudentCommunication(
  studentId: string,
  input: unknown,
  user: { id: string; name: string | null },
) {
  const body = parseBody(createCommunicationInput, input);
  await requireActiveStudent(studentId);
  const created = await prisma.communication.create({
    data: {
      studentId,
      type: body.type,
      content: body.content,
      createdById: user.id,
      createdByName: user.name ?? "알 수 없음",
    },
  });
  return { item: serializeCommunication(created) };
}

export async function checkStudentCommunication(
  studentId: string,
  communicationId: string,
  input: unknown,
) {
  parseBody(patchCommunicationInput, input);
  const existing = await prisma.communication.findUnique({
    where: { id: communicationId },
    select: { studentId: true },
  });
  if (!existing || existing.studentId !== studentId) {
    throw new MobileApiError("요청을 찾을 수 없습니다", 404);
  }
  const updated = await prisma.communication.update({
    where: { id: communicationId },
    data: { isChecked: true, checkedAt: new Date() },
  });
  return { item: serializeCommunication(updated) };
}

// ─── 학생 프로필 (기존 상세 + 오늘 출결·14일 출결·상벌점·요청·멘토링) ──────────

const ATTENDANCE_TYPE_LABEL: Record<AttendanceType, string> = {
  NORMAL: "정상",
  ABSENT: "결석",
  TARDY: "지각",
  EARLY_LEAVE: "정상", // 웹 학생 상세와 동일 (구 데이터)
  APPROVED_ABSENT: "공결",
  NOTIFIED_ABSENT: "미입실",
};

const MENTORING_STATUS_LABEL: Record<MentoringStatus, string> = {
  SCHEDULED: "예정",
  COMPLETED: "완료",
  CANCELLED: "취소",
  RESCHEDULED: "일정 변경",
};

/**
 * GET /staff/student/[id] — 기존 필드(info·assignments·scores)는 그대로 두고 확장.
 */
export async function getStaffStudentProfile(
  studentId: string,
  viewerId: string,
  now = new Date(),
) {
  const context = getKstDayContext(now);
  const since = new Date(context.date.getTime() - 13 * DAY_MS);

  const [base, extra, today, attentionById, meritTotals] = await Promise.all([
    getStaffMobileStudentDetail(studentId),
    prisma.student.findUnique({
      where: { id: studentId },
      select: {
        mentor: { select: { name: true } },
        schedules: { select: { dayOfWeek: true, startTime: true, endTime: true } },
        attendances: {
          where: { date: { gte: since, lte: context.date } },
          orderBy: { date: "desc" },
          select: {
            date: true,
            type: true,
            checkIn: true,
            checkOut: true,
            notes: true,
          },
        },
        merits: {
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: 30,
          select: {
            id: true,
            date: true,
            type: true,
            points: true,
            reason: true,
            category: true,
            visibleInReport: true,
            createdAt: true,
            createdById: true,
          },
        },
        communications: { orderBy: { createdAt: "desc" }, take: 50 },
        mentorings: {
          orderBy: { scheduledAt: "desc" },
          take: 10,
          select: {
            id: true,
            scheduledAt: true,
            scheduledTimeStart: true,
            status: true,
            content: true,
            mentor: { select: { name: true } },
          },
        },
      },
    }),
    getStaffMobileAttendanceItem(studentId, now),
    loadAttentionMap([studentId]),
    getMeritTotals(studentId),
  ]);
  if (!extra) throw new MobileApiError("학생을 찾을 수 없습니다", 404);

  const attention = attentionById.get(studentId) ?? null;

  // 최근 14일 — 기록 없는 날도 등원 예정 여부와 함께 채운다
  const recordByDate = new Map(
    extra.attendances.map((a) => [a.date.toISOString().slice(0, 10), a]),
  );
  const scheduleByDay = new Map(extra.schedules.map((s) => [s.dayOfWeek, s]));
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(context.date.getTime() - i * DAY_MS);
    const key = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay();
    const schedule = scheduleByDay.get(weekday) ?? null;
    const record = recordByDate.get(key);
    return {
      date: key,
      weekday,
      isToday: i === 0,
      scheduled: !!schedule,
      scheduleStart: schedule?.startTime ?? null,
      scheduleEnd: schedule?.endTime ?? null,
      record: record
        ? {
            type: record.type,
            typeLabel: ATTENDANCE_TYPE_LABEL[record.type],
            checkIn: formatKstTime(record.checkIn),
            checkOut: formatKstTime(record.checkOut),
            notes: record.notes,
          }
        : null,
    };
  });
  const countType = (types: AttendanceType[]) =>
    extra.attendances.filter((a) => types.includes(a.type)).length;

  const communications = extra.communications.map(serializeCommunication);

  return {
    ...base,
    info: { ...base.info, mentorName: extra.mentor?.name ?? null },
    today: today ? { ...today, attention } : null,
    attention,
    attendance14: {
      days,
      summary: {
        normal: countType(["NORMAL", "EARLY_LEAVE"]),
        tardy: countType(["TARDY"]),
        absent: countType(["ABSENT", "NOTIFIED_ABSENT"]),
        excused: countType(["APPROVED_ABSENT"]),
      },
    },
    merits: {
      ...meritTotals,
      recent: await serializeMerits(extra.merits, viewerId),
    },
    communications: {
      items: communications,
      unchecked: communications.filter((c) => !c.isChecked).length,
    },
    mentorings: extra.mentorings.map((m) => {
      const scheduledAt = m.scheduledTimeStart
        ? new Date(
            `${m.scheduledAt.toISOString().slice(0, 10)}T${m.scheduledTimeStart}:00+09:00`,
          )
        : m.scheduledAt;
      const content = m.content?.trim() ?? "";
      return {
        id: m.id,
        scheduledAt: scheduledAt.toISOString(),
        status: m.status,
        statusLabel: MENTORING_STATUS_LABEL[m.status],
        mentorName: m.mentor.name,
        summary: content ? content.slice(0, 120) : null,
      };
    }),
  };
}

// ─── 좌석 현황 ──────────────────────────────────────────────────────────────

/** 배치도(웹과 같은 정의) + 오늘 입퇴실 상태 */
export async function getStaffSeatMap(now = new Date()) {
  const attendance = await getStaffMobileAttendance(now, { withAttention: true });
  return {
    date: attendance.date,
    rooms: getSeatLayoutRooms(),
    items: attendance.items,
    summary: attendance.summary,
  };
}
