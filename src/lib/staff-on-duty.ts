import { prisma } from "@/lib/prisma";

function kstHHMM(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

/** 지금 근무 일정(MentorSchedule)에 있는 재직 직원 id. 끝 "00:00" 은 24시. 순찰 알림·바로 처리할 신청 알림이 같이 쓴다 */
export async function onDutyStaffIds(now = new Date()): Promise<string[]> {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hhmm = kstHHMM(now);
  const rows = await prisma.mentorSchedule.findMany({
    where: { dayOfWeek: kst.getUTCDay(), timeStart: { lte: hhmm }, mentor: { status: "ACTIVE" } },
    select: { mentorId: true, timeEnd: true },
  });
  return rows.filter((r) => r.timeEnd === "00:00" || r.timeEnd > hhmm).map((r) => r.mentorId);
}
