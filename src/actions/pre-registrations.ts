"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireFullAccess } from "@/lib/roles";

const preRegSchema = z.object({
  name: z.string().min(1, "이름을 입력하세요").max(50),
  parentPhone: z.string().max(20).optional(),
  phone: z.string().max(20).optional(),
  grade: z.string().max(10).optional(),
  school: z.string().max(50).optional(),
  tentativeSeat: z.string().max(10).optional(),
  startDate: z.string().optional(),
  memo: z.string().max(2000).optional(),
  selectedSubjects: z.string().max(500).optional(),
});

/** 예비등록 목록 (정식 등록 전). 직원. */
export async function listPreRegistrations() {
  const session = await auth();
  requireStaff(session?.user?.role);
  return prisma.preRegistration.findMany({
    where: { formalizedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

/** 가배정 좌석 점유 여부 — 실좌석을 이미 쓰는 ACTIVE 학생 (경고용, 차단 X). 직원. */
export async function checkSeatAvailability(seat: string): Promise<{ occupiedBy: { id: string; name: string } | null }> {
  const session = await auth();
  requireStaff(session?.user?.role);
  if (!seat) return { occupiedBy: null };
  const occupant = await prisma.student.findFirst({
    where: { seat, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  return { occupiedBy: occupant };
}

export async function createPreRegistration(formData: FormData) {
  const session = await auth();
  requireStaff(session?.user?.role);
  const data = preRegSchema.parse(Object.fromEntries(formData.entries()));

  await prisma.preRegistration.create({
    data: {
      name: data.name,
      parentPhone: data.parentPhone || null,
      phone: data.phone || null,
      grade: data.grade || null,
      school: data.school || null,
      tentativeSeat: data.tentativeSeat || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      memo: data.memo || null,
      selectedSubjects: data.selectedSubjects || null,
      createdById: session!.user!.id,
    },
  });
  revalidatePath("/students");
}

export async function updatePreRegistration(id: string, formData: FormData) {
  const session = await auth();
  requireStaff(session?.user?.role);
  const data = preRegSchema.parse(Object.fromEntries(formData.entries()));

  await prisma.preRegistration.update({
    where: { id },
    data: {
      name: data.name,
      parentPhone: data.parentPhone || null,
      phone: data.phone || null,
      grade: data.grade || null,
      school: data.school || null,
      tentativeSeat: data.tentativeSeat || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      memo: data.memo || null,
      selectedSubjects: data.selectedSubjects || null,
    },
  });
  revalidatePath("/students");
}

export async function deletePreRegistration(id: string) {
  const session = await auth();
  requireStaff(session?.user?.role);
  await prisma.preRegistration.delete({ where: { id } });
  revalidatePath("/students");
}

/**
 * 정식 등록 — 예비등록을 ACTIVE 학생으로 전환.
 * checkoutOccupantId 가 주어지면(가배정 좌석에 기존 학생이 입실 중) 같은 트랜잭션에서
 * 그 학생을 퇴원(WITHDRAWN + 좌석 비움) 처리 후 좌석을 인계한다. 원장 전용.
 */
export async function formalizePreRegistration(
  id: string,
  opts?: { checkoutOccupantId?: string },
) {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  const pre = await prisma.preRegistration.findUnique({ where: { id } });
  if (!pre) throw new Error("예비등록을 찾을 수 없습니다");
  if (pre.formalizedAt) throw new Error("이미 정식 등록된 예비등록입니다");
  if (!pre.parentPhone) throw new Error("학부모 연락처가 필요합니다 (정식 등록 전 입력)");
  if (!pre.grade) throw new Error("학년이 필요합니다 (정식 등록 전 입력)");

  const seat = pre.tentativeSeat || null;

  const student = await prisma.$transaction(async (tx) => {
    // 좌석 충돌: 기존 점유자 퇴원 처리 (명시적 동의 시에만)
    if (seat && opts?.checkoutOccupantId) {
      await tx.student.update({
        where: { id: opts.checkoutOccupantId },
        data: { status: "WITHDRAWN", seat: null },
      });
    } else if (seat) {
      // 동의 없이도 동일 좌석 점유자가 남아있으면 좌석만 비워 충돌 방지
      await tx.student.updateMany({
        where: { seat, status: "ACTIVE" },
        data: { seat: null },
      });
    }

    const created = await tx.student.create({
      data: {
        name: pre.name,
        parentPhone: pre.parentPhone!,
        phone: pre.phone,
        grade: pre.grade!,
        school: pre.school,
        seat,
        startDate: pre.startDate ?? new Date(),
        selectedSubjects: pre.selectedSubjects,
        studentInfo: pre.memo,
        status: "ACTIVE",
      },
    });

    await tx.preRegistration.update({
      where: { id },
      data: { formalizedStudentId: created.id, formalizedAt: new Date() },
    });
    return created;
  });

  revalidatePath("/students");
  revalidatePath("/seat-map");
  revalidatePath("/attendance");
  return { studentId: student.id };
}
