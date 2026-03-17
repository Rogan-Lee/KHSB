"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type PlanItem = {
  id: string;
  text: string;
  done: boolean;
  colorCode: string;
  duration?: number; // minutes
};

export async function getDailyPlan(studentId: string, date: Date) {
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

export async function upsertDailyPlan(
  studentId: string,
  date: Date,
  items: PlanItem[],
  notes: string
) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  await prisma.dailyPlan.upsert({
    where: { studentId_date: { studentId, date: start } },
    create: { studentId, date: start, items, notes: notes || null },
    update: { items, notes: notes || null },
  });

  revalidatePath("/timetable");
}
