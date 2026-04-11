"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

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
  birthDate: z.string().optional(),
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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());
  const data = studentSchema.parse(raw);

  try {
    await prisma.student.create({
      data: {
        ...data,
        phone: data.phone || null,
        parentEmail: data.parentEmail || null,
        school: data.school || null,
        classGroup: data.classGroup && data.classGroup !== "none" ? data.classGroup : null,
        seat: data.seat && data.seat !== "none" ? data.seat : null,
        mentorId: data.mentorId && data.mentorId !== "none" ? data.mentorId : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
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
  } catch (error) {
    console.error("[createStudent] 실패", { userId: session.user.id, error });
    throw new Error("학생 등록에 실패했습니다. 다시 시도해주세요.");
  }

  revalidatePath("/students");
  redirect("/students");
}

export async function updateStudent(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());
  const data = studentSchema.parse(raw);

  try {
    await prisma.student.update({
      where: { id },
      data: {
        ...data,
        phone: data.phone || null,
        parentEmail: data.parentEmail || null,
        school: data.school || null,
        classGroup: data.classGroup && data.classGroup !== "none" ? data.classGroup : null,
        seat: data.seat && data.seat !== "none" ? data.seat : null,
        mentorId: data.mentorId && data.mentorId !== "none" ? data.mentorId : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
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
  } catch (error) {
    console.error("[updateStudent] 실패", { userId: session.user.id, studentId: id, error });
    throw new Error("학생 정보 수정에 실패했습니다. 다시 시도해주세요.");
  }

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  redirect(`/students/${id}`);
}

export async function deleteStudent(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role === "STUDENT")
    throw new Error("Unauthorized");

  try {
    await prisma.student.delete({ where: { id } });
  } catch (error) {
    console.error("[deleteStudent] 실패", { userId: session.user.id, studentId: id, error });
    throw new Error("학생 삭제에 실패했습니다. 다시 시도해주세요.");
  }

  revalidatePath("/students");
  redirect("/students");
}

// 퇴실 처리: 소프트 삭제 (상태 변경 + 좌석 반납, 데이터는 보존)
export async function checkoutStudent(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role === "STUDENT")
    throw new Error("Unauthorized");

  try {
    await prisma.student.update({
      where: { id },
      data: { status: "WITHDRAWN", seat: null },
    });
  } catch (error) {
    console.error("[checkoutStudent] 실패", { userId: session.user.id, studentId: id, error });
    throw new Error("퇴실 처리에 실패했습니다. 다시 시도해주세요.");
  }

  revalidatePath("/students");
  revalidatePath("/seat-map");
}

// 재입실 처리: 퇴원 학생을 다시 활성 상태로 전환
export async function readmitStudent(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role === "STUDENT")
    throw new Error("Unauthorized");

  try {
    await prisma.student.update({
      where: { id },
      data: { status: "ACTIVE" },
    });
  } catch (error) {
    console.error("[readmitStudent] 실패", { userId: session.user.id, studentId: id, error });
    throw new Error("재입실 처리에 실패했습니다. 다시 시도해주세요.");
  }

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

  try {
    await prisma.student.update({ where: { id }, data: { seat: newSeat.trim() } });
  } catch (error) {
    console.error("[moveStudentSeat] 실패", { userId: session.user.id, studentId: id, newSeat, error });
    throw new Error("좌석 이동에 실패했습니다. 다시 시도해주세요.");
  }

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
  try {
    await prisma.$transaction([
      prisma.student.update({ where: { id: id1 }, data: { seat: null } }),
      prisma.student.update({ where: { id: id2 }, data: { seat: s1.seat } }),
      prisma.student.update({ where: { id: id1 }, data: { seat: s2.seat } }),
    ]);
  } catch (error) {
    console.error("[swapStudentSeats] 실패", { userId: session.user.id, id1, id2, error });
    throw new Error("좌석 교환에 실패했습니다. 다시 시도해주세요.");
  }

  revalidatePath("/students");
}

export async function updateStudentStatus(
  id: string,
  status: "ACTIVE" | "INACTIVE" | "GRADUATED"
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  try {
    await prisma.student.update({ where: { id }, data: { status } });
  } catch (error) {
    console.error("[updateStudentStatus] 실패", { userId: session.user.id, studentId: id, status, error });
    throw new Error("학생 상태 변경에 실패했습니다. 다시 시도해주세요.");
  }

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
}

export async function updateStudentSeat(studentId: string, seat: string | null) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  try {
    // 같은 좌석을 이미 쓰는 학생이 있으면 먼저 비움
    if (seat) {
      await prisma.student.updateMany({
        where: { seat, id: { not: studentId } },
        data: { seat: null },
      });
    }
    await prisma.student.update({ where: { id: studentId }, data: { seat } });
  } catch (error) {
    console.error("[updateStudentSeat] 실패", { userId: session.user.id, studentId, seat, error });
    throw new Error("좌석 배정에 실패했습니다. 다시 시도해주세요.");
  }

  revalidatePath("/seat-map");
  revalidatePath("/students");
}

export async function patchStudentTextFields(
  id: string,
  fields: { studentInfo?: string; changeNote?: string; academySchedule?: string }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  try {
    await prisma.student.update({
      where: { id },
      data: {
        ...(fields.studentInfo !== undefined && { studentInfo: fields.studentInfo || null }),
        ...(fields.changeNote !== undefined && { changeNote: fields.changeNote || null }),
        ...(fields.academySchedule !== undefined && { academySchedule: fields.academySchedule || null }),
      },
    });
  } catch (error) {
    console.error("[patchStudentTextFields] 실패", { userId: session.user.id, studentId: id, error });
    throw new Error("학생 정보 수정에 실패했습니다. 다시 시도해주세요.");
  }

  revalidatePath("/attendance");
}

type CheckDateKey = "vocabTestDate" | "pledgeDate" | "mockAnalysisDate" | "schoolAnalysisDate" | "plannerSentDate" | "weeklyPlanDate";

export async function patchStudentCheckDate(
  id: string,
  key: CheckDateKey,
  date: string | null  // "YYYY-MM-DD" or null to clear
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  try {
    await prisma.student.update({
      where: { id },
      data: { [key]: date ? new Date(date) : null },
    });
  } catch (error) {
    console.error("[patchStudentCheckDate] 실패", { userId: session.user.id, studentId: id, key, error });
    throw new Error("날짜 정보 수정에 실패했습니다. 다시 시도해주세요.");
  }

  revalidatePath("/attendance");
}

export async function getStudents() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  return prisma.student.findMany({
    include: { mentor: { select: { id: true, name: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function getStudent(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

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
