// 일회성 스모크: 예약 → cron 적용 로직 검증 (합성 학생, 종료 시 삭제)
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
process.env.DATABASE_URL = process.env.DIRECT_URL || process.env.DATABASE_URL; // pooler 대신 직결

const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error("FAIL: " + msg); };

async function main() {
const { prisma } = await import("@/lib/prisma");
const { applyScheduleChange } = await import("@/lib/attendance-schedule");
const { todayKST } = await import("@/lib/utils");
const student = await prisma.student.create({
  data: { name: "__SMOKE_TEST__", grade: "테스트", status: "ACTIVE", parentPhone: "000-0000-0000", startDate: new Date() },
});
try {
  // 과거/오늘 정리 상태: 초기 스케줄 없음
  const change = await prisma.scheduledScheduleChange.create({
    data: {
      studentId: student.id,
      effectiveDate: todayKST(), // 오늘 도래
      attendance: [{ dayOfWeek: 1, startTime: "09:00", endTime: "22:00" }],
      outings: [{ dayOfWeek: 1, outStart: "12:00", outEnd: "13:00", reason: "점심" }],
    },
  });

  // cron 쿼리 재현
  const due = await prisma.scheduledScheduleChange.findMany({
    where: { appliedAt: null, effectiveDate: { lte: todayKST() } },
    orderBy: { effectiveDate: "asc" },
  });
  assert(due.some((d) => d.id === change.id), "오늘자 예약이 due에 포함되어야 함");

  await applyScheduleChange(student.id, change.attendance as any, change.outings as any);
  await prisma.scheduledScheduleChange.update({ where: { id: change.id }, data: { appliedAt: new Date() } });

  const sch = await prisma.attendanceSchedule.findMany({ where: { studentId: student.id } });
  const out = await prisma.outingSchedule.findMany({ where: { studentId: student.id } });
  const stu = await prisma.student.findUnique({ where: { id: student.id } });
  assert(sch.length === 1 && sch[0].dayOfWeek === 1 && sch[0].startTime === "09:00", "입퇴실 일정 반영");
  assert(out.length === 1 && out[0].reason === "점심", "외출 일정 반영");
  assert(stu?.classGroup === "선택반", "반 자동분류(1일=선택반)");

  const stillDue = await prisma.scheduledScheduleChange.findMany({
    where: { appliedAt: null, effectiveDate: { lte: todayKST() } },
  });
  assert(!stillDue.some((d) => d.id === change.id), "적용 후 due에서 빠져야 함");

  console.log("✅ 모든 검증 통과");
} finally {
  await prisma.student.delete({ where: { id: student.id } }); // cascade: schedules/outings/scheduledChanges
  console.log("🧹 합성 학생 삭제 완료");
  await prisma.$disconnect();
}
}

main();
