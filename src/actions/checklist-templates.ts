"use server";

import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ShiftType } from "@/generated/prisma";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

function requireAdmin(role?: string) {
  if (role !== "DIRECTOR" && role !== "ADMIN") throw new Error("권한이 없습니다");
}

export async function getChecklistTemplates() {
  const session = await getSession();
  return prisma.checklistTemplate.findMany({
    where: { orgId: session.orgId },
    orderBy: { order: "asc" },
  });
}

export async function createChecklistTemplate(data: { title: string; shiftType: ShiftType }) {
  const session = await getSession();
  requireAdmin(session.role);

  const maxOrder = await prisma.checklistTemplate.aggregate({
    where: { orgId: session.orgId },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? -1) + 1;

  const template = await prisma.checklistTemplate.create({
    data: { orgId: session.orgId, title: data.title.trim(), shiftType: data.shiftType, order },
  });

  revalidatePath("/handover");
  return template;
}

export async function updateChecklistTemplate(
  id: string,
  data: { title?: string; shiftType?: ShiftType; isActive?: boolean }
) {
  const session = await getSession();
  requireAdmin(session.role);

  const template = await prisma.checklistTemplate.update({
    where: { id, orgId: session.orgId },
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
  const session = await getSession();
  requireAdmin(session.role);

  await prisma.checklistTemplate.delete({ where: { id, orgId: session.orgId } });
  revalidatePath("/handover");
}

export async function reorderChecklistTemplates(ids: string[]) {
  const session = await getSession();
  requireAdmin(session.role);

  await Promise.all(
    ids.map((id, index) =>
      prisma.checklistTemplate.update({ where: { id, orgId: session.orgId }, data: { order: index } })
    )
  );

  revalidatePath("/handover");
}
