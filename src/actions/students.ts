"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const studentSchema = z.object({
  name: z.string().min(1, "이름을 입력하세요"),
  phone: z.string().optional(),
  parentPhone: z.string().min(1, "학부모 연락처를 입력하세요"),
  grade: z.string().min(1, "학년을 선택하세요"),
  school: z.string().optional(),
  seat: z.string().optional(),
  startDate: z.string().min(1, "등원일을 입력하세요"),
  endDate: z.string().optional(),
  mentorId: z.string().optional(),
});

export async function createStudent(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());
  const data = studentSchema.parse(raw);

  await prisma.student.create({
    data: {
      ...data,
      phone: data.phone || null,
      school: data.school || null,
      seat: data.seat || null,
      mentorId: data.mentorId || null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      startDate: new Date(data.startDate),
    },
  });

  revalidatePath("/students");
  redirect("/students");
}

export async function updateStudent(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());
  const data = studentSchema.parse(raw);

  await prisma.student.update({
    where: { id },
    data: {
      ...data,
      phone: data.phone || null,
      school: data.school || null,
      seat: data.seat || null,
      mentorId: data.mentorId || null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      startDate: new Date(data.startDate),
    },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  redirect(`/students/${id}`);
}

export async function deleteStudent(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role === "STUDENT")
    throw new Error("Unauthorized");

  await prisma.student.delete({ where: { id } });
  revalidatePath("/students");
  redirect("/students");
}

export async function updateStudentStatus(
  id: string,
  status: "ACTIVE" | "INACTIVE" | "GRADUATED"
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.student.update({ where: { id }, data: { status } });
  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
}

export async function getStudents() {
  return prisma.student.findMany({
    include: { mentor: { select: { id: true, name: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function getStudent(id: string) {
  return prisma.student.findUnique({
    where: { id },
    include: {
      mentor: { select: { id: true, name: true } },
      schedules: true,
      attendances: { orderBy: { date: "desc" }, take: 30 },
      merits: { orderBy: { date: "desc" }, take: 20 },
      mentorings: {
        orderBy: { scheduledAt: "desc" },
        take: 10,
        include: { mentor: { select: { name: true } } },
      },
      academicPlans: { orderBy: [{ year: "desc" }, { month: "desc" }] },
      consultations: { orderBy: { scheduledAt: "desc" }, take: 10 },
    },
  });
}
