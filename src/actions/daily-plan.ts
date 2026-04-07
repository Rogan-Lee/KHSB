"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { revalidatePath } from "next/cache";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

export type PlanItem = {
  id: string;
  text: string;
  done: boolean;
  colorCode: string;
  duration?: number; // minutes
};

export async function getDailyPlan(studentId: string, date: Date) {
  const session = await getSession();

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const plan = await prisma.dailyPlan.findUnique({
    where: { studentId_date: { studentId, date: start }, orgId: session.orgId },
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
  const session = await getSession();

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  await prisma.dailyPlan.upsert({
    where: { studentId_date: { studentId, date: start } },
    create: { orgId: session.orgId, studentId, date: start, items, notes: notes || null },
    update: { items, notes: notes || null },
  });

  revalidatePath("/timetable");
}
