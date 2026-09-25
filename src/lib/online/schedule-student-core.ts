import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  sanitizeAttendance,
  sanitizeOutings,
  type AttendanceSlot,
  type OutingSlot,
} from "@/lib/online/schedule-commit";

// 등원 스케줄 제출(학생 측) 핵심 로직 — 학생 ID 기준.
// 인증은 호출 측 책임: 웹 서버 액션(src/actions/online/schedule-proposals.ts, 매직링크 토큰)과
// 학생 앱(src/lib/mobile-student-plan.ts, requireMobileStudent)이 같이 쓴다.

/** 학생이 주간 등하원/외출 스케줄을 제출. 새 버전으로 기록. */
export async function submitScheduleProposalForStudent(
  studentId: string,
  input: { attendance: unknown; outings: unknown; memo?: string | null },
) {
  const attendance: AttendanceSlot[] = sanitizeAttendance(input.attendance);
  const outings: OutingSlot[] = sanitizeOutings(input.outings);

  const last = await prisma.scheduleProposal.findFirst({
    where: { studentId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;

  const created = await prisma.scheduleProposal.create({
    data: {
      studentId,
      version,
      status: "SUBMITTED",
      submittedAttendance: attendance,
      submittedOutings: outings,
      studentMemo: input.memo?.trim() || null,
      // 제안 초기값 = 제출값 (운영진이 검토/수정)
      proposedAttendance: attendance,
      proposedOutings: outings,
    },
  });
  revalidatePath("/online/schedules");
  return { id: created.id, version };
}

/** 본인 제출 이력 (최신 버전 먼저). */
export async function listScheduleProposalsForStudent(studentId: string) {
  const rows = await prisma.scheduleProposal.findMany({
    where: { studentId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true, createdAt: true, committedAt: true },
  });
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    committedAt: r.committedAt?.toISOString() ?? null,
  }));
}
