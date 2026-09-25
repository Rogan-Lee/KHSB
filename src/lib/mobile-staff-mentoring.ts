// 직원 앱 — 멘토링 탭(오늘·이번 주 일정)과 멘토링 상세(기록 + 사진 + 학부모 리포트 상태).
// 기록 조회·저장 자체는 src/lib/mobile-workflows.ts(getMobileMentoringRecord / completeMobileMentoring) 를 그대로 쓴다.

import type { MentoringStatus, Role } from "@/generated/prisma";
import { getAppUrl } from "@/lib/app-url";
import { MobileApiError } from "@/lib/mobile-auth";
import { getMobileMentoringRecord } from "@/lib/mobile-workflows";
import { prisma } from "@/lib/prisma";

type StaffUser = { id: string; role: Role };

export type MentoringScheduleRange = "today" | "week";
export type MentoringSessionState = "SCHEDULED" | "NEEDS_RECORD" | "COMPLETED";

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const BACKLOG_DAYS = 14;

const STATE_LABEL: Record<MentoringSessionState, string> = {
  SCHEDULED: "예정",
  NEEDS_RECORD: "기록 필요",
  COMPLETED: "완료",
};

/** Date → KST 날짜 키 "YYYY-MM-DD" */
function kstDateKey(date: Date) {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function kstStartOfDay(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+09:00`);
}

function kstTime(date: Date) {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(11, 16);
}

/** scheduledAt 이 시각 없이 날짜만 저장된 값(UTC·KST 자정)인지 */
function isDateOnly(date: Date) {
  const utc = date.toISOString().slice(11, 23);
  return utc === "00:00:00.000" || utc === "15:00:00.000";
}

const HHMM = /^\d{2}:\d{2}$/;

/**
 * 멘토링 시작 시각. scheduledTimeStart("14:00") 가 있으면 scheduledAt 의 KST 날짜 + 그 시각,
 * 없으면 scheduledAt 그대로.
 */
function mentoringTiming(m: {
  scheduledAt: Date;
  scheduledTimeStart: string | null;
  scheduledTimeEnd: string | null;
}) {
  const dateKey = kstDateKey(m.scheduledAt);
  const hasStart = !!m.scheduledTimeStart && HHMM.test(m.scheduledTimeStart);
  const startsAt = hasStart
    ? new Date(`${dateKey}T${m.scheduledTimeStart}:00+09:00`)
    : m.scheduledAt;
  const timeLabel = hasStart
    ? m.scheduledTimeStart!
    : isDateOnly(m.scheduledAt)
      ? null
      : kstTime(m.scheduledAt);
  const endTimeLabel =
    m.scheduledTimeEnd && HHMM.test(m.scheduledTimeEnd) ? m.scheduledTimeEnd : null;
  return { dateKey, startsAt, timeLabel, endTimeLabel };
}

function sessionState(status: MentoringStatus, startsAt: Date, now: Date): MentoringSessionState {
  if (status === "COMPLETED") return "COMPLETED";
  return startsAt.getTime() <= now.getTime() ? "NEEDS_RECORD" : "SCHEDULED";
}

/** MENTOR 는 본인 멘토링만, 그 외 오프라인 운영진은 전체 (기존 멘토링 탭과 같은 범위) */
function ownerWhere(user: StaffUser) {
  return user.role === "MENTOR" ? { mentorId: user.id } : {};
}

const sessionSelect = {
  id: true,
  mentorId: true,
  mentor: { select: { name: true } },
  scheduledAt: true,
  scheduledTimeStart: true,
  scheduledTimeEnd: true,
  status: true,
  student: { select: { grade: true, id: true, name: true, seat: true } },
  parentReports: {
    where: { revokedAt: null },
    take: 1,
    select: { id: true },
  },
} as const;

type SessionRow = {
  id: string;
  mentorId: string;
  mentor: { name: string };
  scheduledAt: Date;
  scheduledTimeStart: string | null;
  scheduledTimeEnd: string | null;
  status: MentoringStatus;
  student: { grade: string; id: string; name: string; seat: string | null };
  parentReports: { id: string }[];
};

function toSessionItem(row: SessionRow, user: StaffUser, now: Date) {
  const timing = mentoringTiming(row);
  const state = sessionState(row.status, timing.startsAt, now);
  return {
    id: row.id,
    studentId: row.student.id,
    studentName: row.student.name,
    grade: row.student.grade,
    seat: row.student.seat,
    mentorId: row.mentorId,
    mentorName: row.mentor.name,
    isMine: row.mentorId === user.id,
    dateKey: timing.dateKey,
    startsAt: timing.startsAt.toISOString(),
    timeLabel: timing.timeLabel,
    endTimeLabel: timing.endTimeLabel,
    state,
    stateLabel: STATE_LABEL[state],
    hasParentReport: row.parentReports.length > 0,
  };
}

function byStart(a: { startsAt: string }, b: { startsAt: string }) {
  return a.startsAt.localeCompare(b.startsAt);
}

/**
 * 멘토링 일정 — range=today(오늘) | week(이번 주 월~일, KST).
 * backlog: 범위 시작 전 최근 14일 안에 기록이 밀린(예정 상태로 남은) 멘토링.
 */
export async function getStaffMentoringSchedule(
  user: StaffUser,
  rangeParam: string | null,
  now = new Date(),
) {
  const range: MentoringScheduleRange = rangeParam === "week" ? "week" : "today";
  const todayKey = kstDateKey(now);
  const todayStart = kstStartOfDay(todayKey);

  let start = todayStart;
  let end = new Date(todayStart.getTime() + DAY_MS);
  if (range === "week") {
    // 0=일 … 6=토 → 월요일 기준 오프셋
    const dow = new Date(todayStart.getTime() + KST_OFFSET_MS).getUTCDay();
    start = new Date(todayStart.getTime() - ((dow + 6) % 7) * DAY_MS);
    end = new Date(start.getTime() + 7 * DAY_MS);
  }
  const startKey = kstDateKey(start);
  const endKey = kstDateKey(new Date(end.getTime() - DAY_MS));
  const backlogFrom = new Date(start.getTime() - BACKLOG_DAYS * DAY_MS);

  // scheduledAt 저장 방식(시각 포함/날짜만)이 섞여 있어 하루씩 넉넉히 조회한 뒤 KST 날짜로 거른다.
  const [inRange, backlogRows] = await Promise.all([
    prisma.mentoring.findMany({
      where: {
        ...ownerWhere(user),
        status: { not: "CANCELLED" },
        scheduledAt: {
          gte: new Date(start.getTime() - DAY_MS),
          lt: new Date(end.getTime() + DAY_MS),
        },
      },
      orderBy: { scheduledAt: "asc" },
      take: 400,
      select: sessionSelect,
    }),
    prisma.mentoring.findMany({
      where: {
        ...ownerWhere(user),
        status: { in: ["SCHEDULED", "RESCHEDULED"] },
        scheduledAt: {
          gte: new Date(backlogFrom.getTime() - DAY_MS),
          lt: new Date(start.getTime() + DAY_MS),
        },
      },
      orderBy: { scheduledAt: "asc" },
      take: 100,
      select: sessionSelect,
    }),
  ]);

  const items = inRange
    .map((row) => toSessionItem(row, user, now))
    .filter((item) => item.dateKey >= startKey && item.dateKey <= endKey)
    .sort(byStart);
  const backlog = backlogRows
    .map((row) => toSessionItem(row, user, now))
    .filter((item) => item.dateKey < startKey && item.dateKey >= kstDateKey(backlogFrom))
    .sort(byStart);

  return {
    range,
    today: todayKey,
    startDate: startKey,
    endDate: endKey,
    scope: user.role === "MENTOR" ? ("mine" as const) : ("all" as const),
    items,
    backlog,
    summary: {
      total: items.length,
      scheduled: items.filter((i) => i.state === "SCHEDULED").length,
      needsRecord: items.filter((i) => i.state === "NEEDS_RECORD").length,
      completed: items.filter((i) => i.state === "COMPLETED").length,
      backlog: backlog.length,
    },
  };
}

/**
 * 멘토링 상세 — 기록(mobile-workflows) + 담당 멘토·시간·상태 + 첨부 사진 + 최신 학부모 리포트 + 지난 회차 목표.
 * 권한은 getMobileMentoringRecord 가 검사(멘토는 본인 멘토링만).
 */
export async function getStaffMentoringDetail(
  mentoringId: string,
  user: StaffUser,
  now = new Date(),
) {
  const record = await getMobileMentoringRecord(mentoringId, user.id, user.role);

  const extra = await prisma.mentoring.findUnique({
    where: { id: mentoringId },
    select: {
      actualDate: true,
      actualEndTime: true,
      actualStartTime: true,
      mentorId: true,
      mentor: { select: { name: true } },
      scheduledAt: true,
      scheduledTimeEnd: true,
      scheduledTimeStart: true,
      status: true,
      studentId: true,
      photos: {
        orderBy: { uploadedAt: "asc" },
        take: 30,
        select: { fileName: true, id: true, thumbnailUrl: true, url: true },
      },
      parentReports: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, expiresAt: true, id: true, revokedAt: true, token: true },
      },
    },
  });
  // record 조회가 성공했으므로 존재가 보장되지만, 동시 삭제에 대비
  if (!extra) throw new MobileApiError("멘토링을 찾을 수 없습니다", 404);

  const previous = await prisma.mentoring.findFirst({
    where: {
      studentId: extra.studentId,
      status: "COMPLETED",
      id: { not: mentoringId },
      scheduledAt: { lt: extra.scheduledAt },
    },
    orderBy: [{ actualDate: "desc" }, { scheduledAt: "desc" }],
    select: { actualDate: true, nextGoals: true, scheduledAt: true, weaknesses: true },
  });

  const timing = mentoringTiming(extra);
  const state = sessionState(extra.status, timing.startsAt, now);
  const report = extra.parentReports[0];
  const reportActive =
    !!report && !report.revokedAt && (!report.expiresAt || report.expiresAt > now);

  return {
    ...record,
    mentorId: extra.mentorId,
    mentorName: extra.mentor.name,
    isMine: extra.mentorId === user.id,
    dateKey: timing.dateKey,
    startsAt: timing.startsAt.toISOString(),
    timeLabel: timing.timeLabel,
    endTimeLabel: timing.endTimeLabel,
    actualDate: extra.actualDate?.toISOString() ?? null,
    actualStartTime: extra.actualStartTime,
    actualEndTime: extra.actualEndTime,
    state,
    stateLabel: STATE_LABEL[state],
    cancelled: extra.status === "CANCELLED",
    photos: extra.photos.map((p) => ({
      id: p.id,
      name: p.fileName,
      thumbnailUrl: p.thumbnailUrl,
      url: p.url,
    })),
    parentReport: report
      ? {
          id: report.id,
          createdAt: report.createdAt.toISOString(),
          expiresAt: report.expiresAt?.toISOString() ?? null,
          active: reportActive,
          url: `${getAppUrl()}/r/${report.token}`,
        }
      : null,
    previous: previous
      ? {
          date: (previous.actualDate ?? previous.scheduledAt).toISOString(),
          nextGoals: previous.nextGoals,
          weaknesses: previous.weaknesses,
        }
      : null,
  };
}
