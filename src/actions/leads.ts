"use server";

import { prisma } from "@/lib/prisma";
import { requireFullAccess } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import type { LeadStatus } from "@/generated/prisma";

export async function getLeads(status?: LeadStatus) {
  await requireFullAccess();
  return prisma.lead.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function getLeadById(id: string) {
  await requireFullAccess();
  return prisma.lead.findUnique({ where: { id } });
}

export async function createLead(data: {
  name: string;
  phone: string;
  location?: string;
  currentMethod?: string;
  source?: string;
  referredBy?: string;
  notes?: string;
}) {
  await requireFullAccess();
  if (!data.name.trim() || !data.phone.trim()) {
    throw new Error("이름과 연락처는 필수입니다");
  }

  await prisma.lead.create({
    data: {
      name: data.name.trim(),
      phone: data.phone.trim(),
      location: data.location?.trim() || null,
      currentMethod: data.currentMethod?.trim() || null,
      source: data.source?.trim() || null,
      referredBy: data.referredBy?.trim() || null,
      notes: data.notes?.trim() || null,
    },
  });
  revalidatePath("/leads");
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  await requireFullAccess();
  const data: { status: LeadStatus; convertedAt?: Date | null } = { status };
  if (status === "CONVERTED") {
    data.convertedAt = new Date();
  }
  await prisma.lead.update({ where: { id }, data });
  revalidatePath("/leads");
}

export async function updateLead(
  id: string,
  data: {
    name?: string;
    phone?: string;
    location?: string;
    currentMethod?: string;
    source?: string;
    referredBy?: string;
    notes?: string;
    nextFollowUp?: string | null;
  },
) {
  await requireFullAccess();
  await prisma.lead.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name.trim() }),
      ...(data.phone && { phone: data.phone.trim() }),
      ...(data.location !== undefined && {
        location: data.location?.trim() || null,
      }),
      ...(data.currentMethod !== undefined && {
        currentMethod: data.currentMethod?.trim() || null,
      }),
      ...(data.source !== undefined && {
        source: data.source?.trim() || null,
      }),
      ...(data.referredBy !== undefined && {
        referredBy: data.referredBy?.trim() || null,
      }),
      ...(data.notes !== undefined && { notes: data.notes?.trim() || null }),
      ...(data.nextFollowUp !== undefined && {
        nextFollowUp: data.nextFollowUp ? new Date(data.nextFollowUp) : null,
      }),
    },
  });
  revalidatePath("/leads");
}

export async function deleteLead(id: string) {
  await requireFullAccess();
  await prisma.lead.delete({ where: { id } });
  revalidatePath("/leads");
}

export async function getLeadStats() {
  await requireFullAccess();
  const [total, byStatus] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);
  return {
    total,
    byStatus: Object.fromEntries(
      byStatus.map((s) => [s.status, s._count._all]),
    ),
  };
}
