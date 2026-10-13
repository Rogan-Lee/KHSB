import type { Prisma } from "@/generated/prisma/client";
import type { PortalChatSenderType } from "@/generated/prisma/enums";
import { latestIdsPerGroup } from "@/lib/db/latest-per-group";
import { prisma } from "@/lib/prisma";

/**
 * 학생의 담당 직원(mentor/consultant/staff)에 대해 채팅방 row를 보장 (없으면 생성, 있으면 그대로).
 * 호출 측(웹 포털 토큰 액션·모바일 가드)이 studentId 를 인증한 뒤에만 부른다.
 * "use server" 파일 밖에 두어 공개 엔드포인트가 되지 않게 한다.
 */
export async function ensureStudentPortalChats(studentId: string): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      mentorId: true,
      assignedMentorId: true,
      assignedConsultantId: true,
      assignedStaffId: true,
    },
  });
  if (!student) return;

  // 온라인 배정(assigned*) + 오프라인 담당 멘토(mentorId) 모두 채팅 상대로 포함.
  // 재원생은 mentorId 만 있는 경우가 많아 이를 포함해야 채팅이 동작.
  const staffIds = [
    ...new Set(
      [
        student.assignedMentorId,
        student.assignedConsultantId,
        student.assignedStaffId,
        student.mentorId,
      ].filter((id): id is string => !!id)
    ),
  ];

  for (const staffId of staffIds) {
    await prisma.portalChat.upsert({
      where: { studentId_staffId: { studentId: student.id, staffId } },
      update: {},
      create: { studentId: student.id, staffId },
    });
  }
}

export type ChatLastMessage = {
  chatId: string;
  content: string;
  senderType: PortalChatSenderType;
  createdAt: Date;
  attachments: Prisma.JsonValue;
};

/**
 * 채팅방별 마지막 메시지 1건 (목록 미리보기용).
 * 목록 + 중첩 `messages: { take: 1 }` 는 DB 에서 안 잘려 모든 방의 전체 메시지를 가져오므로
 * 방별 최신 id 만 DB 에서 고른 뒤 필요한 컬럼만 조회한다(egress 절감).
 */
export async function lastMessagesByChat(
  chatIds: readonly string[]
): Promise<Map<string, ChatLastMessage>> {
  const ids = await latestIdsPerGroup({
    table: "PortalChatMessage",
    groupBy: "chatId",
    groupIds: chatIds,
    orderBy: [{ column: "createdAt", dir: "desc" }],
  });
  if (ids.length === 0) return new Map();
  const rows = await prisma.portalChatMessage.findMany({
    where: { id: { in: ids } },
    select: { chatId: true, content: true, senderType: true, createdAt: true, attachments: true },
  });
  return new Map(rows.map((r) => [r.chatId, r]));
}
