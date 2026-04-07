"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { MessageType } from "@/generated/prisma";
import { requireStaff } from "@/lib/roles";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

interface SendMessageParams {
  studentId: string;
  type: MessageType;
  recipient: string;
  recipientName?: string;
  content: string;
}

export async function sendMessage(params: SendMessageParams) {
  const session = await getSession();
  requireStaff(session.role);

  // 카카오 알림톡 API 연동 (추후 구현)
  // const result = await sendKakaoAlimtalk(params);

  // 현재는 SENT로 바로 처리 (실제 발송 로직 연동 전)
  await prisma.messageLog.create({
    data: {
      orgId: session.orgId,
      studentId: params.studentId,
      type: params.type,
      recipient: params.recipient,
      recipientName: params.recipientName || null,
      content: params.content,
      status: "SENT", // TODO: 실제 API 연동 후 결과에 따라 변경
    },
  });

  revalidatePath("/messages");
}

export async function sendBulkMessages(
  studentIds: string[],
  type: MessageType,
  templateContent: string
) {
  const session = await getSession();
  requireStaff(session.role);

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, orgId: session.orgId },
    select: { id: true, name: true, parentPhone: true },
  });

  const logs = students.map((s) => ({
    orgId: session.orgId,
    studentId: s.id,
    type,
    recipient: s.parentPhone,
    recipientName: `${s.name} 학부모`,
    content: templateContent.replace("{name}", s.name),
    status: "SENT" as const,
  }));

  await prisma.messageLog.createMany({ data: logs });
  revalidatePath("/messages");

  return { sent: logs.length };
}

export async function getMessageLogs(studentId?: string) {
  const session = await getSession();
  requireStaff(session.role);

  return prisma.messageLog.findMany({
    where: studentId ? { orgId: session.orgId, studentId } : { orgId: session.orgId },
    include: {
      student: { select: { id: true, name: true } },
    },
    orderBy: { sentAt: "desc" },
    take: 100,
  });
}
