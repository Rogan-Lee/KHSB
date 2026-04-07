"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { isFullAccess } from "@/lib/roles";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

async function assertDirector() {
  const session = await getSession();
  if (!isFullAccess(session.role)) throw new Error("Unauthorized");
  return session;
}

export async function createMentor(formData: FormData) {
  const session = await assertDirector();

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const role = (formData.get("role") as string) || "MENTOR";

  if (!name || !email) throw new Error("필수 항목을 입력하세요");
  if (role !== "MENTOR" && role !== "STAFF") throw new Error("올바르지 않은 역할입니다");

  await prisma.user.create({
    data: {
      name,
      email,
      role: role as "MENTOR" | "STAFF",
      memberships: { create: { orgId: session.orgId } },
    },
  });

  revalidatePath("/mentors");
}

export async function updateMentor(id: string, formData: FormData) {
  const session = await assertDirector();

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const role = formData.get("role") as string | null;

  if (!name || !email) throw new Error("필수 항목을 입력하세요");

  const validRoles = ["MENTOR", "STAFF", "DIRECTOR", "ADMIN"];
  const data: { name: string; email: string; role?: "MENTOR" | "STAFF" | "DIRECTOR" | "ADMIN" } = { name, email };
  if (role && validRoles.includes(role)) data.role = role as "MENTOR" | "STAFF" | "DIRECTOR" | "ADMIN";

  await prisma.user.update({ where: { id }, data });
  revalidatePath("/mentors");
}

export async function deleteMentor(id: string) {
  const session = await assertDirector();
  await prisma.user.delete({ where: { id } });
  revalidatePath("/mentors");
}

export async function saveMentorScheduleForMentor(
  mentorId: string,
  dayOfWeek: number,
  timeStart: string,
  timeEnd: string
) {
  const session = await assertDirector();

  await prisma.mentorSchedule.upsert({
    where: { mentorId_dayOfWeek: { mentorId, dayOfWeek } },
    create: { orgId: session.orgId, mentorId, dayOfWeek, timeStart, timeEnd },
    update: { timeStart, timeEnd },
  });

  revalidatePath("/mentors");
}

export async function deleteMentorScheduleById(id: string) {
  const session = await assertDirector();
  await prisma.mentorSchedule.delete({ where: { id, orgId: session.orgId } });
  revalidatePath("/mentors");
}
