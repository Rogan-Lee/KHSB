"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ShiftType } from "@/generated/prisma";

function requireAdmin(role?: string) {
  // 루틴 관리는 원장·시스템관리자 + 총괄멘토(HEAD_MENTOR)까지 허용
  if (role !== "DIRECTOR" && role !== "SUPER_ADMIN" && role !== "HEAD_MENTOR") {
    throw new Error("권한이 없습니다");
  }
}

export async function getChecklistTemplates() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return prisma.checklistTemplate.findMany({
    orderBy: { order: "asc" },
  });
}

export async function createChecklistTemplate(data: { title: string; shiftType: ShiftType; days?: string }) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAdmin(session.user.role);

  const maxOrder = await prisma.checklistTemplate.aggregate({ _max: { order: true } });
  const order = (maxOrder._max.order ?? -1) + 1;

  const template = await prisma.checklistTemplate.create({
    data: { title: data.title.trim(), shiftType: data.shiftType, days: data.days ?? "", order },
  });

  revalidatePath("/handover");
  return template;
}

export async function updateChecklistTemplate(
  id: string,
  data: { title?: string; shiftType?: ShiftType; days?: string; isActive?: boolean }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAdmin(session.user.role);

  const template = await prisma.checklistTemplate.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.shiftType !== undefined && { shiftType: data.shiftType }),
      ...(data.days !== undefined && { days: data.days }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });

  revalidatePath("/handover");
  return template;
}

export async function deleteChecklistTemplate(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAdmin(session.user.role);

  await prisma.checklistTemplate.delete({ where: { id } });
  revalidatePath("/handover");
}

// ── 루틴 일별 완료 (RoutineCompletion) ──────────────────────────────────────

/** 해당 날짜에 완료된 루틴 templateId 목록 */
export async function getRoutineCompletions(date: string): Promise<string[]> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const rows = await prisma.routineCompletion.findMany({
    where: { date: new Date(date) },
    select: { templateId: true },
  });
  return rows.map((r) => r.templateId);
}

/** 루틴 완료 토글 — 그 날짜 행이 있으면 삭제(미완료), 없으면 생성(완료) */
export async function toggleRoutineCompletion(templateId: string, date: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const d = new Date(date);
  const existing = await prisma.routineCompletion.findUnique({
    where: { templateId_date: { templateId, date: d } },
  });

  if (existing) {
    await prisma.routineCompletion.delete({ where: { id: existing.id } });
  } else {
    await prisma.routineCompletion.create({
      data: {
        templateId,
        date: d,
        checkedById: session.user.id,
        checkedByName: session.user.name ?? null,
      },
    });
  }

  revalidatePath("/handover");
  return { completed: !existing };
}

export async function reorderChecklistTemplates(ids: string[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAdmin(session.user.role);

  await Promise.all(
    ids.map((id, index) =>
      prisma.checklistTemplate.update({ where: { id }, data: { order: index } })
    )
  );

  revalidatePath("/handover");
}
