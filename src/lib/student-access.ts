import { prisma } from "@/lib/prisma";
import { isFullAccess } from "@/lib/roles";

type AssignmentFields = {
  mentorId: string | null;
  assignedMentorId: string | null;
  assignedConsultantId: string | null;
  assignedStaffId: string | null;
};

/**
 * 해당 학생의 담당자(오프라인 멘토 또는 온라인 배정)인지 여부.
 */
export function isResponsibleFor(
  student: AssignmentFields,
  userId?: string | null
): boolean {
  if (!userId) return false;
  return (
    student.mentorId === userId ||
    student.assignedMentorId === userId ||
    student.assignedConsultantId === userId ||
    student.assignedStaffId === userId
  );
}

/**
 * 전 직원 대상 기능(수행평가 등)에서 특정 학생을 관리할 권한 검증.
 * - 원장/SUPER_ADMIN: 전체 허용
 * - 그 외 직원: 본인 담당 학생만 허용
 * 위반 시 throw. studentId 만 알 때 사용.
 */
export async function assertCanManageStudent(
  role: string | null | undefined,
  userId: string | null | undefined,
  studentId: string
): Promise<void> {
  if (isFullAccess(role)) {
    const exists = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!exists) throw new Error("학생을 찾을 수 없습니다");
    return;
  }
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      mentorId: true,
      assignedMentorId: true,
      assignedConsultantId: true,
      assignedStaffId: true,
    },
  });
  if (!student) throw new Error("학생을 찾을 수 없습니다");
  if (!isResponsibleFor(student, userId)) {
    throw new Error("담당 학생이 아닙니다");
  }
}
