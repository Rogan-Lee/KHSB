"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { isFullAccess } from "@/lib/roles";

async function assertDirector() {
  const session = await auth();
  if (!session?.user || !isFullAccess(session.user.role)) throw new Error("Unauthorized");
  return session;
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
  const phone = ((formData.get("phone") as string) || "").trim() || null;

  if (!name || !email) throw new Error("필수 항목을 입력하세요");
  const createValidRoles = ["MENTOR", "STAFF", "HEAD_MENTOR", "CONSULTANT", "MANAGER_MENTOR"] as const;
  type CreateRole = typeof createValidRoles[number];
  if (!(createValidRoles as readonly string[]).includes(role)) {
    throw new Error("올바르지 않은 역할입니다");
  }

  await prisma.user.create({
    data: { name, email, role: role as CreateRole, phone },
  });

  revalidatePath("/mentors");
}

export async function updateMentor(id: string, formData: FormData) {
  await assertDirector();

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const role = formData.get("role") as string | null;
  // phone 필드가 폼에 있을 때만 갱신 (빈 문자열이면 null 로 비움)
  const hasPhone = formData.has("phone");
  const phone = ((formData.get("phone") as string) || "").trim() || null;

  if (!name || !email) throw new Error("필수 항목을 입력하세요");

  const validRoles = ["MENTOR", "STAFF", "HEAD_MENTOR", "CONSULTANT", "MANAGER_MENTOR", "DIRECTOR", "SUPER_ADMIN"] as const;
  type ValidRole = typeof validRoles[number];
  const data: { name: string; email: string; role?: ValidRole; phone?: string | null } = { name, email };
  if (role && (validRoles as readonly string[]).includes(role)) data.role = role as ValidRole;
  if (hasPhone) data.phone = phone;

  await prisma.user.update({ where: { id }, data });
  revalidatePath("/mentors");
}

export async function deleteMentor(id: string) {
  const session = await assertDirector();
  // UI(mentor-manager)와 동일 기준을 서버에서 강제: 본인·원장·시스템 관리자 계정은 삭제 불가
  if (id === session.user.id) throw new Error("본인 계정은 삭제할 수 없습니다");
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) throw new Error("직원을 찾을 수 없습니다");
  if (isFullAccess(target.role)) throw new Error("원장·시스템 관리자 계정은 삭제할 수 없습니다");
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
