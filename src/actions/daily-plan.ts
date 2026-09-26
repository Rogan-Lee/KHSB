"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAnyStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";

export type PlanItem = {
  id: string;
  text: string;
  done: boolean;
  colorCode: string;
  duration?: number; // minutes
};

export async function getDailyPlan(studentId: string, date: Date) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const plan = await prisma.dailyPlan.findUnique({
    where: { studentId_date: { studentId, date: start } },
  });

  if (!plan) return { items: [] as PlanItem[], notes: "" };

  return {
    items: (plan.items as PlanItem[]) ?? [],
    notes: plan.notes ?? "",
  };
}

// JSON 컬럼에 클라이언트 객체를 그대로 저장하지 않고 알려진 필드만 길이 제한해 남긴다
// (lib/student-schedule-core.ts sanitizeItems 와 같은 규칙, 스태프 화면이라 상한만 조금 넉넉히).
function sanitizePlanItems(items: PlanItem[]): PlanItem[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 100).map((it) => ({
    id: String(it?.id ?? "").slice(0, 40),
    text: String(it?.text ?? "").slice(0, 500),
    done: Boolean(it?.done),
    colorCode: String(it?.colorCode ?? "blue").slice(0, 20),
    ...(typeof it?.duration === "number" && Number.isFinite(it.duration)
      ? { duration: Math.max(0, Math.min(1440, Math.round(it.duration))) }
      : {}),
  }));
}

export async function upsertDailyPlan(
  studentId: string,
  date: Date,
  items: PlanItem[],
  notes: string
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAnyStaff(session.user.role);

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  if (isNaN(start.getTime())) throw new Error("날짜가 올바르지 않습니다");

  const safeItems = sanitizePlanItems(items);
  const safeNotes = typeof notes === "string" && notes ? notes.slice(0, 5000) : null;

  await prisma.dailyPlan.upsert({
    where: { studentId_date: { studentId, date: start } },
    create: { studentId, date: start, items: safeItems, notes: safeNotes },
    update: { items: safeItems, notes: safeNotes },
  });

  revalidatePath("/timetable");
}
