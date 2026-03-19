"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ShiftType } from "@/generated/prisma";

function requireAdmin(role?: string) {
  if (role !== "DIRECTOR" && role !== "ADMIN") throw new Error("권한이 없습니다");
}

export async function getChecklistTemplates() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return prisma.checklistTemplate.findMany({
    orderBy: { order: "asc" },
  });
}

export async function createChecklistTemplate(data: { title: string; shiftType: ShiftType }) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAdmin(session.user.role);

  const maxOrder = await prisma.checklistTemplate.aggregate({ _max: { order: true } });
  const order = (maxOrder._max.order ?? -1) + 1;

  const template = await prisma.checklistTemplate.create({
    data: { title: data.title.trim(), shiftType: data.shiftType, order },
  });

  revalidatePath("/handover");
  return template;
}

export async function updateChecklistTemplate(
  id: string,
  data: { title?: string; shiftType?: ShiftType; isActive?: boolean }
) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireAdmin(session.user.role);

  const template = await prisma.checklistTemplate.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.shiftType !== undefined && { shiftType: data.shiftType }),
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
