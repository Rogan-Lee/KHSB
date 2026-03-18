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
  parentEmail: z.string().optional(),
  grade: z.string().min(1, "학년을 선택하세요"),
  school: z.string().optional(),
  classGroup: z.string().optional(),
  seat: z.string().optional(),
  startDate: z.string().min(1, "등원일을 입력하세요"),
  endDate: z.string().optional(),
  mentorId: z.string().optional(),
  internalScoreRange: z.string().optional(),
  mockScoreRange: z.string().optional(),
  targetUniversity: z.string().optional(),
  mentoringNotes: z.string().optional(),
  academySchedule: z.string().optional(),
  studentInfo: z.string().optional(),
  selectedSubjects: z.string().optional(),
  admissionType: z.string().optional(),
  onlineLectures: z.string().optional(),
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
      parentEmail: data.parentEmail || null,
      school: data.school || null,
      classGroup: data.classGroup && data.classGroup !== "none" ? data.classGroup : null,
      seat: data.seat || null,
      mentorId: data.mentorId && data.mentorId !== "none" ? data.mentorId : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      startDate: new Date(data.startDate),
      internalScoreRange: data.internalScoreRange || null,
      mockScoreRange: data.mockScoreRange || null,
      targetUniversity: data.targetUniversity || null,
      mentoringNotes: data.mentoringNotes || null,
      academySchedule: data.academySchedule || null,
      studentInfo: data.studentInfo || null,
      selectedSubjects: data.selectedSubjects || null,
      admissionType: data.admissionType || null,
      onlineLectures: data.onlineLectures || null,
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
      parentEmail: data.parentEmail || null,
      school: data.school || null,
      classGroup: data.classGroup && data.classGroup !== "none" ? data.classGroup : null,
      seat: data.seat || null,
      mentorId: data.mentorId && data.mentorId !== "none" ? data.mentorId : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      startDate: new Date(data.startDate),
      internalScoreRange: data.internalScoreRange || null,
      mockScoreRange: data.mockScoreRange || null,
      targetUniversity: data.targetUniversity || null,
      mentoringNotes: data.mentoringNotes || null,
      academySchedule: data.academySchedule || null,
      studentInfo: data.studentInfo || null,
      selectedSubjects: data.selectedSubjects || null,
      admissionType: data.admissionType || null,
      onlineLectures: data.onlineLectures || null,
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

// 퇴실 처리: 학생 데이터 전체 삭제 (좌석 반환)
export async function checkoutStudent(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role === "STUDENT")
    throw new Error("Unauthorized");

  await prisma.student.delete({ where: { id } });
  revalidatePath("/students");
}

// 좌석 이동 (빈 자리로)
export async function moveStudentSeat(id: string, newSeat: string) {
  const session = await auth();
  if (!session?.user || session.user.role === "STUDENT")
    throw new Error("Unauthorized");

  const existing = await prisma.student.findFirst({
    where: { seat: newSeat.trim(), id: { not: id } },
    select: { id: true, name: true },
  });
  if (existing) throw new Error(`${newSeat} 자리에 이미 ${existing.name}이(가) 있습니다`);

  await prisma.student.update({ where: { id }, data: { seat: newSeat.trim() } });
  revalidatePath("/students");
}

// 좌석 맞교환
export async function swapStudentSeats(id1: string, id2: string) {
  const session = await auth();
  if (!session?.user || session.user.role === "STUDENT")
    throw new Error("Unauthorized");

  const [s1, s2] = await Promise.all([
    prisma.student.findUnique({ where: { id: id1 }, select: { seat: true } }),
    prisma.student.findUnique({ where: { id: id2 }, select: { seat: true } }),
  ]);
  if (!s1 || !s2) throw new Error("학생을 찾을 수 없습니다");

  // 임시로 null 처리 후 교환 (constraint 충돌 방지)
  await prisma.$transaction([
    prisma.student.update({ where: { id: id1 }, data: { seat: null } }),
    prisma.student.update({ where: { id: id2 }, data: { seat: s1.seat } }),
    prisma.student.update({ where: { id: id1 }, data: { seat: s2.seat } }),
  ]);
  revalidatePath("/students");
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

export async function patchStudentTextFields(
  id: string,
  fields: { studentInfo?: string; changeNote?: string; academySchedule?: string }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  await prisma.student.update({
    where: { id },
    data: {
      ...(fields.studentInfo !== undefined && { studentInfo: fields.studentInfo || null }),
      ...(fields.changeNote !== undefined && { changeNote: fields.changeNote || null }),
      ...(fields.academySchedule !== undefined && { academySchedule: fields.academySchedule || null }),
    },
  });
  revalidatePath("/attendance");
}

type CheckDateKey = "vocabTestDate" | "pledgeDate" | "mockAnalysisDate" | "schoolAnalysisDate" | "plannerSentDate";

export async function patchStudentCheckDate(
  id: string,
  key: CheckDateKey,
  date: string | null  // "YYYY-MM-DD" or null to clear
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  await prisma.student.update({
    where: { id },
    data: { [key]: date ? new Date(date) : null },
  });
  revalidatePath("/attendance");
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
