"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

async function assertDirector() {
  const session = await auth();
  if (session?.user?.role !== "DIRECTOR") throw new Error("Unauthorized");
}

export async function createMentor(formData: FormData) {
  await assertDirector();

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const role = (formData.get("role") as string) || "MENTOR";

  if (!name || !email || !password) throw new Error("필수 항목을 입력하세요");
  if (role !== "MENTOR" && role !== "STAFF") throw new Error("올바르지 않은 역할입니다");

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { name, email, password: hashed, role: role as "MENTOR" | "STAFF" },
  });

  revalidatePath("/mentors");
}

export async function updateMentor(id: string, formData: FormData) {
  await assertDirector();

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as string | null;

  if (!name || !email) throw new Error("필수 항목을 입력하세요");

  const validRoles = ["MENTOR", "STAFF", "DIRECTOR"];
  const data: { name: string; email: string; password?: string; role?: "MENTOR" | "STAFF" | "DIRECTOR" } = { name, email };
  if (password) data.password = await bcrypt.hash(password, 10);
  if (role && validRoles.includes(role)) data.role = role as "MENTOR" | "STAFF" | "DIRECTOR";

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
  await assertDirector();

  await prisma.mentorSchedule.upsert({
    where: { mentorId_dayOfWeek: { mentorId, dayOfWeek } },
    create: { mentorId, dayOfWeek, timeStart, timeEnd },
    update: { timeStart, timeEnd },
  });

  revalidatePath("/mentors");
}

export async function deleteMentorScheduleById(id: string) {
  await assertDirector();
  await prisma.mentorSchedule.delete({ where: { id } });
  revalidatePath("/mentors");
}
