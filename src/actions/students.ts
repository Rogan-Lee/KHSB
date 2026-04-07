"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

const studentSchema = z.object({
  name: z.string().min(1, "이름을 입력하세요").max(50),
  phone: z.string().max(20).optional(),
  parentPhone: z.string().min(1, "학부모 연락처를 입력하세요").max(20),
  parentEmail: z.string().email("올바른 이메일 형식이 아닙니다").max(100).optional().or(z.literal("")),
  grade: z.string().min(1, "학년을 선택하세요").max(10),
  school: z.string().max(50).optional(),
  classGroup: z.string().max(50).optional(),
  seat: z.string().max(10).optional(),
  startDate: z.string().min(1, "등원일을 입력하세요"),
  endDate: z.string().optional(),
  mentorId: z.string().optional(),
  internalScoreRange: z.string().max(50).optional(),
  mockScoreRange: z.string().max(50).optional(),
  targetUniversity: z.string().max(100).optional(),
  mentoringNotes: z.string().max(2000).optional(),
  academySchedule: z.string().max(1000).optional(),
  studentInfo: z.string().max(2000).optional(),
  selectedSubjects: z.string().max(500).optional(),
  admissionType: z.string().max(100).optional(),
  onlineLectures: z.string().max(1000).optional(),
});

export async function createStudent(formData: FormData) {
  const session = await getSession();

  const raw = Object.fromEntries(formData.entries());
  const data = studentSchema.parse(raw);

  await prisma.student.create({
    data: {
      orgId: session.orgId,
      ...data,
      phone: data.phone || null,
      parentEmail: data.parentEmail || null,
      school: data.school || null,
      classGroup: data.classGroup && data.classGroup !== "none" ? data.classGroup : null,
      seat: data.seat && data.seat !== "none" ? data.seat : null,
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
  const session = await getSession();

  const raw = Object.fromEntries(formData.entries());
  const data = studentSchema.parse(raw);

  await prisma.student.update({
    where: { id, orgId: session.orgId },
    data: {
      ...data,
      phone: data.phone || null,
      parentEmail: data.parentEmail || null,
      school: data.school || null,
      classGroup: data.classGroup && data.classGroup !== "none" ? data.classGroup : null,
      seat: data.seat && data.seat !== "none" ? data.seat : null,
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
  const session = await getSession();
  if (session.role === "STUDENT") throw new Error("Unauthorized");

  await prisma.student.delete({ where: { id, orgId: session.orgId } });
  revalidatePath("/students");
  redirect("/students");
}

// 퇴실 처리: 소프트 삭제 (상태 변경 + 좌석 반납, 데이터는 보존)
export async function checkoutStudent(id: string) {
  const session = await getSession();
  if (session.role === "STUDENT") throw new Error("Unauthorized");

  await prisma.student.update({
    where: { id, orgId: session.orgId },
    data: { status: "WITHDRAWN", seat: null },
  });
  revalidatePath("/students");
  revalidatePath("/seat-map");
}

// 재입실 처리: 퇴원 학생을 다시 활성 상태로 전환
export async function readmitStudent(id: string) {
  const session = await getSession();
  if (session.role === "STUDENT") throw new Error("Unauthorized");

  await prisma.student.update({
    where: { id, orgId: session.orgId },
    data: { status: "ACTIVE" },
  });
  revalidatePath("/students");
}

// 좌석 이동 (빈 자리로)
export async function moveStudentSeat(id: string, newSeat: string) {
  const session = await getSession();
  if (session.role === "STUDENT") throw new Error("Unauthorized");

  const existing = await prisma.student.findFirst({
    where: { orgId: session.orgId, seat: newSeat.trim(), id: { not: id } },
    select: { id: true, name: true },
  });
  if (existing) throw new Error(`${newSeat} 자리에 이미 ${existing.name}이(가) 있습니다`);

  await prisma.student.update({ where: { id, orgId: session.orgId }, data: { seat: newSeat.trim() } });
  revalidatePath("/students");
}

// 좌석 맞교환
export async function swapStudentSeats(id1: string, id2: string) {
  const session = await getSession();
  if (session.role === "STUDENT") throw new Error("Unauthorized");

  const [s1, s2] = await Promise.all([
    prisma.student.findUnique({ where: { id: id1, orgId: session.orgId }, select: { seat: true } }),
    prisma.student.findUnique({ where: { id: id2, orgId: session.orgId }, select: { seat: true } }),
  ]);
  if (!s1 || !s2) throw new Error("학생을 찾을 수 없습니다");

  // 임시로 null 처리 후 교환 (constraint 충돌 방지)
  await prisma.$transaction([
    prisma.student.update({ where: { id: id1, orgId: session.orgId }, data: { seat: null } }),
    prisma.student.update({ where: { id: id2, orgId: session.orgId }, data: { seat: s1.seat } }),
    prisma.student.update({ where: { id: id1, orgId: session.orgId }, data: { seat: s2.seat } }),
  ]);
  revalidatePath("/students");
}

export async function updateStudentStatus(
  id: string,
  status: "ACTIVE" | "INACTIVE" | "GRADUATED"
) {
  const session = await getSession();

  await prisma.student.update({ where: { id, orgId: session.orgId }, data: { status } });
  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
}

export async function updateStudentSeat(studentId: string, seat: string | null) {
  const session = await getSession();

  // 같은 좌석을 이미 쓰는 학생이 있으면 먼저 비움
  if (seat) {
    await prisma.student.updateMany({
      where: { orgId: session.orgId, seat, id: { not: studentId } },
      data: { seat: null },
    });
  }

  await prisma.student.update({ where: { id: studentId, orgId: session.orgId }, data: { seat } });
  revalidatePath("/seat-map");
  revalidatePath("/students");
}

export async function patchStudentTextFields(
  id: string,
  fields: { studentInfo?: string; changeNote?: string; academySchedule?: string }
) {
  const session = await getSession();
  await prisma.student.update({
    where: { id, orgId: session.orgId },
    data: {
      ...(fields.studentInfo !== undefined && { studentInfo: fields.studentInfo || null }),
      ...(fields.changeNote !== undefined && { changeNote: fields.changeNote || null }),
      ...(fields.academySchedule !== undefined && { academySchedule: fields.academySchedule || null }),
    },
  });
  revalidatePath("/attendance");
}

type CheckDateKey = "vocabTestDate" | "pledgeDate" | "mockAnalysisDate" | "schoolAnalysisDate" | "plannerSentDate" | "weeklyPlanDate";

export async function patchStudentCheckDate(
  id: string,
  key: CheckDateKey,
  date: string | null  // "YYYY-MM-DD" or null to clear
) {
  const session = await getSession();
  await prisma.student.update({
    where: { id, orgId: session.orgId },
    data: { [key]: date ? new Date(date) : null },
  });
  revalidatePath("/attendance");
}

export async function getStudents() {
  const session = await getSession();

  return prisma.student.findMany({
    where: { orgId: session.orgId },
    include: { mentor: { select: { id: true, name: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function getStudent(id: string) {
  const session = await getSession();

  return prisma.student.findUnique({
    where: { id, orgId: session.orgId },
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
