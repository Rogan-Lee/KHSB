"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { isFullAccess } from "@/lib/roles";

async function assertDirector() {
  const session = await auth();
  if (!isFullAccess(session?.user?.role)) throw new Error("Unauthorized");
}

// 멘토 스케줄 관리는 총괄 멘토(HEAD_MENTOR)에게도 허용
async function assertCanManageMentorSchedules() {
  const session = await auth();
  const role = session?.user?.role;
  if (!isFullAccess(role) && role !== "HEAD_MENTOR") {
    throw new Error("Unauthorized");
  }
}

export async function createMentor(formData: FormData) {
  await assertDirector();

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const role = (formData.get("role") as string) || "MENTOR";

  if (!name || !email) throw new Error("필수 항목을 입력하세요");
  const createValidRoles = ["MENTOR", "STAFF", "HEAD_MENTOR", "CONSULTANT", "MANAGER_MENTOR"] as const;
  type CreateRole = typeof createValidRoles[number];
  if (!(createValidRoles as readonly string[]).includes(role)) {
    throw new Error("올바르지 않은 역할입니다");
  }

  await prisma.user.create({
    data: { name, email, role: role as CreateRole },
  });

  revalidatePath("/mentors");
}

export async function updateMentor(id: string, formData: FormData) {
  await assertDirector();

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const role = formData.get("role") as string | null;

  if (!name || !email) throw new Error("필수 항목을 입력하세요");

  const validRoles = ["MENTOR", "STAFF", "HEAD_MENTOR", "CONSULTANT", "MANAGER_MENTOR", "DIRECTOR", "SUPER_ADMIN"] as const;
  type ValidRole = typeof validRoles[number];
  const data: { name: string; email: string; role?: ValidRole } = { name, email };
  if (role && (validRoles as readonly string[]).includes(role)) data.role = role as ValidRole;

  await prisma.user.update({ where: { id }, data });
  revalidatePath("/mentors");
}

export async function deleteMentor(id: string) {
  await assertDirector();
  await prisma.user.delete({ where: { id } });
  revalidatePath("/mentors");
}

export async function saveMentorScheduleForMentor(
  mentorId: string,
  dayOfWeek: number,
  timeStart: string,
  timeEnd: string
) {
  await assertCanManageMentorSchedules();

  await prisma.mentorSchedule.upsert({
    where: { mentorId_dayOfWeek: { mentorId, dayOfWeek } },
    create: { mentorId, dayOfWeek, timeStart, timeEnd },
    update: { timeStart, timeEnd },
  });

  revalidatePath("/mentors");
}

export async function deleteMentorScheduleById(id: string) {
  await assertCanManageMentorSchedules();
  await prisma.mentorSchedule.delete({ where: { id } });
  revalidatePath("/mentors");
}
