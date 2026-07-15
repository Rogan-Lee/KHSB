import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";
import { applyScheduleChange, type AttendanceSlot, type OutingSlot } from "@/lib/attendance-schedule";

export const dynamic = "force-dynamic";

// KST 00시 — 실행 예정일이 도래한 등원 일정 예약을 적용
export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  const due = await prisma.scheduledScheduleChange.findMany({
    where: { appliedAt: null, effectiveDate: { lte: todayKST() } },
    orderBy: { effectiveDate: "asc" }, // 같은 학생 여러 건이면 옛 날짜부터 → 최신이 마지막에 반영
  });

  let applied = 0;
  const errors: { id: string; error: string }[] = [];
  for (const change of due) {
    try {
      await applyScheduleChange(
        change.studentId,
        (change.attendance as unknown as AttendanceSlot[]) ?? [],
        (change.outings as unknown as OutingSlot[]) ?? []
      );
      await prisma.scheduledScheduleChange.update({
        where: { id: change.id },
        data: { appliedAt: new Date() },
      });
      applied++;
    } catch (e) {
      errors.push({ id: change.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, found: due.length, applied, errors });
}
