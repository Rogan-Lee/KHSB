import { redirect, notFound } from "next/navigation";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { getChatMessages } from "@/actions/online/portal-chat";
import { ChatView } from "@/components/online/chat/chat-view";

const ROLE_LABEL: Record<string, string> = {
  CONSULTANT: "컨설턴트",
  MANAGER_MENTOR: "관리 멘토",
  STAFF: "운영조교",
};

export default async function StudentChatDetailPage({
  params,
}: {
  params: Promise<{ token: string; chatId: string }>;
}) {
  const { token, chatId } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  // Ownership check
  const chat = await prisma.portalChat.findUnique({
    where: { id: chatId },
    select: { id: true, studentId: true },
  });
  if (!chat || chat.studentId !== session.student.id) notFound();

  const data = await getChatMessages({ chatId, studentToken: token });

  return (
    <ChatView
      chatId={chatId}
      studentToken={token}
      viewer="STUDENT"
      initialMessages={data.messages}
      partnerName={data.chat.staff.name}
      partnerLabel={ROLE_LABEL[data.chat.staff.role] ?? "직원"}
    />
  );
}
