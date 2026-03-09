"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MeritType } from "@/generated/prisma";

const meritSchema = z.object({
  studentId: z.string(),
  date: z.string(),
  type: z.nativeEnum(MeritType),
  points: z.coerce.number().min(1).max(100),
  reason: z.string().min(1, "사유를 입력하세요"),
  category: z.string().optional(),
});

export async function createMeritDemerit(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());
  const data = meritSchema.parse(raw);

  await prisma.meritDemerit.create({
    data: {
      studentId: data.studentId,
      date: new Date(data.date),
      type: data.type,
      points: data.points,
      reason: data.reason,
      category: data.category || null,
      createdById: session.user.id,
    },
  });

  revalidatePath("/merit-demerit");
  revalidatePath(`/students/${data.studentId}`);
}

export async function deleteMeritDemerit(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const record = await prisma.meritDemerit.findUnique({ where: { id } });
  if (!record) throw new Error("Not found");

  await prisma.meritDemerit.delete({ where: { id } });
  revalidatePath("/merit-demerit");
  revalidatePath(`/students/${record.studentId}`);
}

export async function getMeritDemerits(studentId?: string) {
  return prisma.meritDemerit.findMany({
    where: studentId ? { studentId } : undefined,
    include: { student: { select: { id: true, name: true, grade: true } } },
    orderBy: { date: "desc" },
  });
}

export async function getStudentPointSummary() {
  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      grade: true,
      merits: {
        select: { type: true, points: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return students.map((s) => {
    const totalMerits = s.merits
      .filter((m) => m.type === "MERIT")
      .reduce((acc, m) => acc + m.points, 0);
    const totalDemerits = s.merits
      .filter((m) => m.type === "DEMERIT")
      .reduce((acc, m) => acc + m.points, 0);
    return {
      id: s.id,
      name: s.name,
      grade: s.grade,
      totalMerits,
      totalDemerits,
      netPoints: totalMerits - totalDemerits,
    };
  });
}
