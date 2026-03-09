"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { MessageType } from "@/generated/prisma";

interface SendMessageParams {
  studentId: string;
  type: MessageType;
  recipient: string;
  recipientName?: string;
  content: string;
}

export async function sendMessage(params: SendMessageParams) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  // 카카오 알림톡 API 연동 (추후 구현)
  // const result = await sendKakaoAlimtalk(params);

  // 현재는 SENT로 바로 처리 (실제 발송 로직 연동 전)
  await prisma.messageLog.create({
    data: {
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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, name: true, parentPhone: true },
  });

  const logs = students.map((s) => ({
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
  return prisma.messageLog.findMany({
    where: studentId ? { studentId } : undefined,
    include: {
      student: { select: { id: true, name: true } },
    },
    orderBy: { sentAt: "desc" },
    take: 100,
  });
}
