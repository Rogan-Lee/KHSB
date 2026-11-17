"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAnyStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { sanitizePlanItems as sanitizeShared, type StudentPlanItem } from "@/lib/student-schedule-core";

export type PlanItem = StudentPlanItem;

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

// 학생 앱·포털과 같은 정리 규칙(lib/student-schedule-core) — 스태프 화면이라 상한만 조금 넉넉히
const sanitizePlanItems = (items: PlanItem[]) => sanitizeShared(items, { maxItems: 100, textMax: 500 });

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
