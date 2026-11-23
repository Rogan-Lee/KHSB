// 일회성 스모크: 실행 예정일 예약 → cron 반영 검증 (합성 학생, 종료 시 삭제)
import { createHash } from "node:crypto";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.development.local" });
process.env.DATABASE_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
// 운영 Supabase project-ref 의 SHA-256 (scripts/db-push.mjs 와 같은 값)
const PROD_PROJECT_REF_SHA256 = "37276d3cbb4b3ab00f9978c8eb33b48f41a1a852506ebb19a9b890cae6db5247";
if (
  (process.env.DATABASE_URL ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((part) => createHash("sha256").update(part).digest("hex") === PROD_PROJECT_REF_SHA256)
) {
  throw new Error("운영 DB 에서는 실행할 수 없습니다 — 개발·시험에 실데이터를 쓰지 않습니다");
}

const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m); };

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const { applyDueScheduledProposals } = await import("@/lib/online/schedule-commit");
  const { todayKST } = await import("@/lib/utils");

  const student = await prisma.student.create({
    data: { name: "__SMOKE_COMMIT__", grade: "테스트", status: "ACTIVE", parentPhone: "000-0000-0000", startDate: new Date() },
  });
  try {
    const proposal = await prisma.scheduleProposal.create({
      data: {
        studentId: student.id,
        version: 1,
        status: "APPROVED",
        proposedAttendance: [{ dayOfWeek: 2, startTime: "10:00", endTime: "21:00" }],
        proposedOutings: [{ dayOfWeek: 2, outStart: "13:00", outEnd: "14:00", reason: "학원" }],
        scheduledFor: todayKST(), // 오늘 도래
      },
    });

    // 주의: revalidatePath 는 요청 컨텍스트가 없는 tsx 하네스에서 throw (실제 cron 라우트에선 정상).
    // 트랜잭션은 그 전에 커밋되므로 DB 상태로 검증한다.
    const res = await applyDueScheduledProposals();
    const onlyRevalidateErr = res.errors.every((e) => e.error.includes("revalidatePath"));
    assert(onlyRevalidateErr, "예상외 에러: " + JSON.stringify(res.errors));

    const after = await prisma.scheduleProposal.findUnique({ where: { id: proposal.id } });
    const sch = await prisma.attendanceSchedule.findMany({ where: { studentId: student.id } });
    const out = await prisma.outingSchedule.findMany({ where: { studentId: student.id } });
    const stu = await prisma.student.findUnique({ where: { id: student.id } });
    assert(after?.status === "COMMITTED", "제안 상태 COMMITTED");
    assert(!!after?.committedAt, "committedAt 기록");
    assert(sch.length === 1 && sch[0].startTime === "10:00", "입퇴실 일정 반영");
    assert(out.length === 1 && out[0].reason === "학원", "외출 일정 반영");
    assert(stu?.classGroup === "선택반", "반 자동분류(1일=선택반)");

    // 재실행 — 이미 COMMITTED 라 다시 안 잡힘 (중복 반영 방지)
    const stillDue = await prisma.scheduleProposal.findMany({
      where: { id: proposal.id, status: "APPROVED", scheduledFor: { not: null, lte: todayKST() } },
    });
    assert(stillDue.length === 0, "COMMITTED 후 due 재선택 안 됨");

    console.log("✅ 모든 검증 통과 (revalidate throw 는 하네스 한정, 프로덕션 cron 정상)");
  } finally {
    await prisma.student.delete({ where: { id: student.id } });
    console.log("🧹 합성 학생 삭제 완료");
    await prisma.$disconnect();
  }
}

main();
