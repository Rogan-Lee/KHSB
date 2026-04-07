"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { ConsultationStatus, ConsultationType, ConsultationCategory, ConsultationOwner } from "@/generated/prisma";
import { requireFullAccess } from "@/lib/roles";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

export async function createConsultation(formData: FormData) {
  const session = await getSession();
  requireFullAccess(session.role);

  const raw = Object.fromEntries(formData.entries());
  const studentId = (raw.studentId as string) || null;
  const prospectName = (raw.prospectName as string) || null;

  if (!studentId && !prospectName) {
    throw new Error("원생을 선택하거나 신규 상담 정보를 입력하세요");
  }

  const owner = Object.values(ConsultationOwner).includes(raw.owner as ConsultationOwner)
    ? (raw.owner as ConsultationOwner)
    : "DIRECTOR";

  await prisma.directorConsultation.create({
    data: {
      orgId: session.orgId,
      studentId,
      prospectName,
      prospectGrade: (raw.prospectGrade as string) || null,
      prospectPhone: (raw.prospectPhone as string) || null,
      type: Object.values(ConsultationType).includes(raw.type as ConsultationType)
        ? (raw.type as ConsultationType)
        : "STUDENT",
      category: Object.values(ConsultationCategory).includes(raw.category as ConsultationCategory)
        ? (raw.category as ConsultationCategory)
        : "ENROLLED",
      owner,
      scheduledAt: raw.scheduledAt ? new Date(raw.scheduledAt as string) : null,
      agenda: (raw.agenda as string) || null,
      status: "SCHEDULED",
    },
  });

  revalidatePath("/consultations");
}

export async function updateConsultation(id: string, formData: FormData) {
  const session = await getSession();
  requireFullAccess(session.role);

  const raw = Object.fromEntries(formData.entries());

  // 전달된 필드만 업데이트 (FormData에 키가 있으면 값 적용, 없으면 건드리지 않음)
  const data: Record<string, unknown> = {};
  if (raw.scheduledAt) data.scheduledAt = new Date(raw.scheduledAt as string);
  if (raw.actualDate) data.actualDate = new Date(raw.actualDate as string);
  if (raw.status) data.status = raw.status as ConsultationStatus;
  if (raw.type) data.type = raw.type as ConsultationType;
  if (raw.category) data.category = raw.category as ConsultationCategory;
  if ("agenda" in raw) data.agenda = (raw.agenda as string) || null;
  if ("outcome" in raw) data.outcome = (raw.outcome as string) || null;
  if ("followUp" in raw) data.followUp = (raw.followUp as string) || null;
  if ("notes" in raw) data.notes = (raw.notes as string) || null;

  await prisma.directorConsultation.update({ where: { id, orgId: session.orgId }, data });

  revalidatePath("/consultations");
  revalidatePath(`/consultations/${id}`);
}

export async function getConsultations(owner?: ConsultationOwner) {
  const session = await getSession();
  requireFullAccess(session.role);

  return prisma.directorConsultation.findMany({
    where: owner ? { orgId: session.orgId, owner } : { orgId: session.orgId },
    include: {
      student: { select: { id: true, name: true, grade: true } },
    },
    orderBy: { scheduledAt: "desc" },
  }) as Promise<Array<{
    id: string;
    studentId: string | null;
    prospectName: string | null;
    prospectGrade: string | null;
    prospectPhone: string | null;
    scheduledAt: Date | null;
    actualDate: Date | null;
    status: ConsultationStatus;
    agenda: string | null;
    notes: string | null;
    outcome: string | null;
    followUp: string | null;
    owner: ConsultationOwner;
    student: { id: string; name: string; grade: string } | null;
  }>>;
}

export async function getStudentConsultationHistory(studentId: string, excludeId?: string) {
  const session = await getSession();

  return prisma.directorConsultation.findMany({
    where: {
      orgId: session.orgId,
      studentId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      status: "COMPLETED",
    },
    orderBy: { scheduledAt: "desc" },
    take: 5,
    select: {
      id: true,
      scheduledAt: true,
      actualDate: true,
      agenda: true,
      outcome: true,
      followUp: true,
      notes: true,
    },
  });
}
