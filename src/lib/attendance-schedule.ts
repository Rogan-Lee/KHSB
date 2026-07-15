import { prisma } from "@/lib/prisma";

export type AttendanceSlot = { dayOfWeek: number; startTime: string; endTime: string };
export type OutingSlot = { dayOfWeek: number; outStart: string; outEnd: string; reason?: string | null };

/**
 * 입실 요일 수 → 반 자동 분류
 * - 0회: null (미배정) / 1~3회: 선택반 / 4회 이상: 정규반
 */
export function deriveClassGroup(dayCount: number): string | null {
  if (dayCount === 0) return null;
  if (dayCount >= 4) return "정규반";
  return "선택반";
}

/**
 * 학생 등원 일정(입퇴실+외출) 원자적 교체 + 반 재분류.
 * 인증/캐시무효화 없음 — 서버 액션과 cron 양쪽에서 재사용.
 */
export function applyScheduleChange(
  studentId: string,
  schedules: AttendanceSlot[],
  outings: OutingSlot[]
) {
  const dayCount = new Set(schedules.map((s) => s.dayOfWeek)).size;
  return prisma.$transaction([
    prisma.attendanceSchedule.deleteMany({ where: { studentId } }),
    ...(schedules.length > 0
      ? [prisma.attendanceSchedule.createMany({ data: schedules.map((s) => ({ ...s, studentId })) })]
      : []),
    prisma.outingSchedule.deleteMany({ where: { studentId } }),
    ...(outings.length > 0
      ? [prisma.outingSchedule.createMany({ data: outings.map((o) => ({ studentId, dayOfWeek: o.dayOfWeek, outStart: o.outStart, outEnd: o.outEnd, reason: o.reason ?? null })) })]
      : []),
    prisma.student.update({ where: { id: studentId }, data: { classGroup: deriveClassGroup(dayCount) } }),
  ]);
}
