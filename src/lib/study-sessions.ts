import { z } from "zod";

import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

// 공부 타이머 (StudySession) — 학생 앱 플래너가 시작·정지, 직원 좌석표·학부모 앱이 오늘 합계를 본다.
// 한 기록은 최대 3시간(집중 모드 자동 종료와 같음). 정지하지 않고 둔 기록은 시작 + 3시간에 끝난 것으로 본다.
// "계속 공부"(keep)는 지금 기록을 닫고 같은 과목으로 새로 열어 3시간을 다시 센다.
// 날짜는 시작 시각(KST) 기준 — 자정을 넘긴 기록은 시작한 날로 친다.

export const SESSION_MAX_MS = 3 * 60 * 60_000;
const KST_MS = 9 * 3_600_000;

type SessionRow = { studentId: string; subject: string | null; startedAt: Date; endedAt: Date | null };

export type TimerSummary = {
  /** 지금 재고 있는 기록 (3시간이 지났으면 null) */
  active: { subject: string | null; startedAt: string } | null;
  /** 오늘 합계(분) — 진행 중이면 지금까지 */
  totalMinutes: number;
  /** 과목별 오늘 합계 — 많은 순 */
  bySubject: { subject: string | null; minutes: number }[];
};

/** KST 기준 오늘 0시 */
export function kstDayStart(now: Date): Date {
  const k = new Date(now.getTime() + KST_MS);
  k.setUTCHours(0, 0, 0, 0);
  return new Date(k.getTime() - KST_MS);
}

/** 끝난 시각 — 열려 있으면 지금, 어느 쪽이든 시작 + 3시간까지 */
function endOf(s: { startedAt: Date; endedAt: Date | null }, now: Date): number {
  return Math.min((s.endedAt ?? now).getTime(), s.startedAt.getTime() + SESSION_MAX_MS);
}

export function sessionMinutes(s: { startedAt: Date; endedAt: Date | null }, now: Date): number {
  return Math.max(0, Math.round((endOf(s, now) - s.startedAt.getTime()) / 60_000));
}

export function summarize(rows: Omit<SessionRow, "studentId">[], now: Date): TimerSummary {
  const dayStart = kstDayStart(now).getTime();
  const live = rows.find((s) => !s.endedAt && now.getTime() - s.startedAt.getTime() < SESSION_MAX_MS);
  const bySubject = new Map<string | null, number>();
  let total = 0;
  for (const s of rows) {
    if (s.startedAt.getTime() < dayStart) continue;
    const m = sessionMinutes(s, now);
    total += m;
    bySubject.set(s.subject, (bySubject.get(s.subject) ?? 0) + m);
  }
  return {
    active: live ? { subject: live.subject, startedAt: live.startedAt.toISOString() } : null,
    totalMinutes: total,
    bySubject: [...bySubject.entries()]
      .filter(([, m]) => m > 0)
      .map(([subject, minutes]) => ({ subject, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
  };
}

/** 학생들의 오늘 타이머 요약 — 좌석표처럼 여러 명을 한 번에 (쿼리 1번) */
export async function loadTimerSummaries(studentIds: string[], now = new Date()): Promise<Map<string, TimerSummary>> {
  const result = new Map<string, TimerSummary>();
  if (studentIds.length === 0) return result;
  const rows = await prisma.studySession.findMany({
    where: {
      studentId: { in: studentIds },
      // 오늘 시작한 기록 + 어제 밤에 시작해 아직 3시간이 안 된 열린 기록(진행 중 표시용)
      OR: [
        { startedAt: { gte: kstDayStart(now) } },
        { endedAt: null, startedAt: { gte: new Date(now.getTime() - SESSION_MAX_MS) } },
      ],
    },
    orderBy: { startedAt: "asc" },
    select: { studentId: true, subject: true, startedAt: true, endedAt: true },
  });
  const byStudent = new Map<string, SessionRow[]>();
  for (const r of rows) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);
  for (const id of studentIds) result.set(id, summarize(byStudent.get(id) ?? [], now));
  return result;
}

export async function getTimerSummary(studentId: string, now = new Date()) {
  const summary = (await loadTimerSummaries([studentId], now)).get(studentId)!;
  // 기기 시계가 틀려도 경과 시간이 맞게 — 앱은 서버 시각과의 차이를 보정해 센다
  return { now: now.toISOString(), ...summary };
}

const actionSchema = z.object({
  action: z.enum(["start", "stop", "keep"], { message: "타이머 동작을 확인해 주세요" }),
  subject: z.string().trim().max(20, "과목 이름이 너무 길어요").nullable().optional(),
});

/** 학생 타이머 시작·정지·계속 — 응답은 getTimerSummary 와 같다 */
export async function timerAction(studentId: string, input: unknown, now = new Date()) {
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) throw new MobileApiError(parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요", 400);
  const { action } = parsed.data;
  const subject = parsed.data.subject || null;

  await prisma.$transaction(async (tx) => {
    // 열린 기록은 모두 닫는다 (3시간이 지났으면 3시간 시점으로) — 학생당 열린 기록은 늘 하나 이하
    const open = await tx.studySession.findMany({
      where: { studentId, endedAt: null },
      orderBy: { startedAt: "desc" },
      select: { id: true, subject: true, startedAt: true },
    });
    for (const o of open) {
      await tx.studySession.update({
        where: { id: o.id },
        data: { endedAt: new Date(endOf({ startedAt: o.startedAt, endedAt: null }, now)) },
      });
    }

    if (action === "stop") return;
    if (action === "keep") {
      const live = open.find((o) => now.getTime() - o.startedAt.getTime() < SESSION_MAX_MS);
      if (!live) throw new MobileApiError("진행 중인 타이머가 없어요", 400);
      await tx.studySession.create({ data: { studentId, subject: live.subject, startedAt: now } });
      return;
    }
    await tx.studySession.create({ data: { studentId, subject, startedAt: now } });
  });

  return getTimerSummary(studentId, now);
}
