"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MeritType } from "@/generated/prisma";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

const meritSchema = z.object({
  studentId: z.string(),
  date: z.string(),
  type: z.nativeEnum(MeritType),
  points: z.coerce.number().min(1).max(100),
  reason: z.string().min(1, "사유를 입력하세요"),
  category: z.string().optional(),
});

export async function createMeritDemerit(formData: FormData) {
  const session = await getSession();

  const raw = Object.fromEntries(formData.entries());
  const data = meritSchema.parse(raw);

  await prisma.meritDemerit.create({
    data: {
      orgId: session.orgId,
      studentId: data.studentId,
      date: new Date(data.date),
      type: data.type,
      points: data.points,
      reason: data.reason,
      category: data.category || null,
      createdById: session.id,
    },
  });

  revalidatePath("/merit-demerit");
  revalidatePath(`/students/${data.studentId}`);
}

export async function updateMeritDemerit(id: string, formData: FormData) {
  const session = await getSession();

  const raw = Object.fromEntries(formData.entries());
  const data = meritSchema.omit({ studentId: true }).parse(raw);

  const record = await prisma.meritDemerit.findUnique({ where: { id, orgId: session.orgId } });
  if (!record) throw new Error("Not found");

  await prisma.meritDemerit.update({
    where: { id, orgId: session.orgId },
    data: {
      date: new Date(data.date),
      type: data.type,
      points: data.points,
      reason: data.reason,
      category: data.category || null,
    },
  });

  revalidatePath("/merit-demerit");
  revalidatePath(`/students/${record.studentId}`);
}

export async function deleteMeritDemerit(id: string) {
  const session = await getSession();

  const record = await prisma.meritDemerit.findUnique({ where: { id, orgId: session.orgId } });
  if (!record) throw new Error("Not found");

  await prisma.meritDemerit.delete({ where: { id, orgId: session.orgId } });
  revalidatePath("/merit-demerit");
  revalidatePath(`/students/${record.studentId}`);
}

export async function bulkDeleteMeritDemerits(ids: string[]) {
  const session = await getSession();
  if (!ids.length) return;

  await prisma.meritDemerit.deleteMany({ where: { id: { in: ids }, orgId: session.orgId } });
  revalidatePath("/merit-demerit");
}

export async function getMeritDemerits(studentId?: string) {
  const session = await getSession();

  return prisma.meritDemerit.findMany({
    where: studentId ? { orgId: session.orgId, studentId } : { orgId: session.orgId },
    include: { student: { select: { id: true, name: true, grade: true } } },
    orderBy: { date: "desc" },
  });
}

export async function getMeritsByRange(from: string, to: string) {
  const session = await getSession();

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  return prisma.meritDemerit.findMany({
    where: { orgId: session.orgId, date: { gte: fromDate, lte: toDate } },
    include: { student: { select: { id: true, name: true, grade: true } } },
    orderBy: [{ student: { name: "asc" } }, { date: "asc" }],
  });
}

export async function getStudentPointSummary() {
  const session = await getSession();

  // 매월 1일 초기화: 현재 월의 상벌점만 집계
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const students = await prisma.student.findMany({
    where: { orgId: session.orgId, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      grade: true,
      merits: {
        where: { date: { gte: monthStart } },
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
