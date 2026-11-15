// 순찰 회차 서버 로직 — 웹 액션(src/actions/patrol.ts)·모바일 API(mobile-operations.ts)·크론이 같이 쓴다.
// 인증은 호출 측 책임. (src/lib/patrol.ts 는 화면에서도 쓰는 순수 함수라 DB 코드는 여기에)

import { staffDayStart } from "@/lib/class-periods";
import { authUserIdsForAppUsers, sendMobilePush } from "@/lib/mobile-push";
import { prisma } from "@/lib/prisma";

// 회차를 열어 둔 채 잊은 경우 — 이보다 길면 지금 재실 명단이 회차 때와 달라 자동 기록을 건너뛴다
const AUTO_OK_MAX_ROUND_MS = 60 * 60 * 1000;
// 순찰은 20분 단위 — 마지막 회차 시작(또는 근무 시작)부터 이만큼 지나면 근무자에게 알림, 이후 같은 간격으로 다시
const PATROL_GAP_MS = 20 * 60 * 1000;
const LAST_ALERT_KEY = "patrol.lastOverdueAlertAt";

function kstDateKey(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function kstHHMM(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

/** 지금 자리에 있어야 할 재원생 — 오늘 입실, 아직 퇴실 전, 외출 중 아님. */
async function presentStudentIds(now: Date): Promise<string[]> {
  const date = new Date(kstDateKey(now));
  const [attendance, outings] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { date, checkIn: { not: null }, checkOut: null, student: { status: "ACTIVE" } },
      select: { studentId: true },
    }),
    prisma.dailyOuting.findMany({
      where: { date, outStart: { lte: now }, OR: [{ outEnd: null }, { outEnd: { gt: now } }] },
      select: { studentId: true },
    }),
  ]);
  const out = new Set(outings.map((o) => o.studentId));
  return attendance.map((a) => a.studentId).filter((id) => !out.has(id));
}

/**
 * 순찰 회차 종료. 특이사항을 따로 남기지 않은 재실 학생은 '양호(이상 없음)'로 자동 기록한다.
 * 이미 닫혔거나 없는 회차면 false.
 */
export async function closePatrolRound(roundId: string, now = new Date()): Promise<boolean> {
  const round = await prisma.patrolRound.findFirst({
    where: { id: roundId, endedAt: null },
    select: { startedAt: true },
  });
  if (!round) return false;
  const closed = await prisma.patrolRound.updateMany({
    where: { id: roundId, endedAt: null },
    data: { endedAt: now },
  });
  if (closed.count === 0) return false;

  if (now.getTime() - round.startedAt.getTime() <= AUTO_OK_MAX_ROUND_MS) {
    const ids = await presentStudentIds(now);
    if (ids.length > 0) {
      // 직접 기록한 학생(@@unique roundId+studentId)은 건너뛴다
      await prisma.patrolRecord.createMany({
        data: ids.map((studentId) => ({ roundId, studentId, status: "OK" as const, checkedAt: now })),
        skipDuplicates: true,
      });
    }
  }
  return true;
}

/** 지금 근무 일정(MentorSchedule)에 있는 재직 직원 id. 끝 "00:00" 은 24시. */
async function scheduledStaffIds(now: Date): Promise<string[]> {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hhmm = kstHHMM(now);
  const rows = await prisma.mentorSchedule.findMany({
    where: { dayOfWeek: kst.getUTCDay(), timeStart: { lte: hhmm }, mentor: { status: "ACTIVE" } },
    select: { mentorId: true, timeEnd: true },
  });
  return rows.filter((r) => r.timeEnd === "00:00" || r.timeEnd > hhmm).map((r) => r.mentorId);
}

export type PatrolWatchResult =
  | { alerted: false; reason: string }
  | { alerted: true; minutes: number; recipients: number; sent: number };

/**
 * 미순찰 감시 (크론이 1분마다 호출). 근무 시간에 재실 학생이 있는데 20분 넘게 새 회차가 없으면
 * 오늘 마지막 순찰자 + 지금 근무 일정의 직원(없으면 원장)에게 앱 푸시. 20분마다 한 번씩만.
 */
export async function checkPatrolOverdue(now = new Date()): Promise<PatrolWatchResult> {
  const today = kstDateKey(now);
  const dayStart = Date.parse(`${today}T${staffDayStart(today)}:00+09:00`);
  if (now.getTime() < dayStart) return { alerted: false, reason: "근무 시작 전" };

  // 대부분의 호출은 여기서 끝난다 (회차 1건 조회)
  const last = await prisma.patrolRound.findFirst({
    orderBy: { startedAt: "desc" },
    select: { startedAt: true, patrollerId: true },
  });
  const lastStart = Math.max(dayStart, last?.startedAt.getTime() ?? 0);
  if (now.getTime() - lastStart < PATROL_GAP_MS) return { alerted: false, reason: "순찰 간격 안" };

  const lastAlert = await prisma.appSetting.findUnique({ where: { key: LAST_ALERT_KEY }, select: { value: true } });
  const lastAlertAt = lastAlert ? Date.parse(lastAlert.value) : 0;
  if (lastAlertAt > lastStart && now.getTime() - lastAlertAt < PATROL_GAP_MS) {
    return { alerted: false, reason: "이미 알림" };
  }

  if ((await presentStudentIds(now)).length === 0) return { alerted: false, reason: "재실 학생 없음" };

  const todayPatroller = last && last.startedAt.getTime() >= dayStart ? last.patrollerId : null;
  let staffIds = [...new Set([todayPatroller, ...(await scheduledStaffIds(now))].filter((id): id is string => !!id))];
  if (staffIds.length === 0) {
    const directors = await prisma.user.findMany({
      where: { role: "DIRECTOR", status: "ACTIVE" },
      select: { id: true },
    });
    staffIds = directors.map((u) => u.id);
  }

  // 보내기 전에 기록 — 푸시가 실패해도 1분마다 다시 쏘지 않게
  await prisma.appSetting.upsert({
    where: { key: LAST_ALERT_KEY },
    update: { value: now.toISOString() },
    create: { key: LAST_ALERT_KEY, value: now.toISOString() },
  });

  const minutes = Math.floor((now.getTime() - lastStart) / 60_000);
  const { sent } = await sendMobilePush({
    authUserIds: await authUserIdsForAppUsers(staffIds),
    category: "SYSTEM",
    title: "순찰 시간이 지났어요",
    body: `마지막 순찰 뒤 ${minutes}분이 지났어요. 순찰을 시작해 주세요.`,
    data: { url: "/(staff)/patrol" },
  });
  return { alerted: true, minutes, recipients: staffIds.length, sent };
}
