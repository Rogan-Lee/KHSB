import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getUser } from "@/lib/auth";
import { isAnyStaff } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import {
  getChatMessages,
  listStaffInbox,
} from "@/actions/online/portal-chat";
import { InboxListPanel } from "@/components/online/chat/inbox-list-panel";
import { ChatView } from "@/components/online/chat/chat-view";
import { Avatar } from "@/components/backoffice/ui";
import { InboxFrame } from "../_components/inbox-frame";

export default async function StaffInboxChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  if (!isAnyStaff(user.role)) redirect("/");

  const { chatId } = await params;

  const chat = await prisma.portalChat.findUnique({
    where: { id: chatId },
    select: { id: true, staffId: true },
  });
  if (!chat || chat.staffId !== user.id) notFound();

  const [chatData, chats] = await Promise.all([
    getChatMessages({ chatId }),
    listStaffInbox(),
  ]);
  const totalUnread = chats.reduce((sum, c) => sum + c.unread, 0);

  const studentName = chatData.chat.student.name;
  // 학년·학교는 목록 데이터에 있다 — 대화 머리에 함께 보여 준다
  const listed = chats.find((c) => c.id === chatId)?.student;
  const studentMeta = listed
    ? [listed.grade, listed.school].filter(Boolean).join(" · ")
    : "";

  return (
    <InboxFrame
      mode="chat"
      list={
        <InboxListPanel
          chats={chats}
          totalUnread={totalUnread}
          staffRole={user.role}
          className="h-full"
        />
      }
    >
      <header className="flex h-x14 shrink-0 items-center gap-x2 border-b border-stroke-neutral-muted bg-bg-layer-default px-x2 md:px-x5">
        <Link
          href="/online/inbox"
          aria-label="대화 목록으로"
          className="grid size-x10 shrink-0 place-items-center rounded-r2 text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed md:hidden"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <Avatar name={studentName} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate t5-bold text-fg-neutral">{studentName}</p>
          {studentMeta && (
            <p className="truncate t2-regular text-fg-neutral-subtle">{studentMeta}</p>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <ChatView
          chatId={chatId}
          viewer="STAFF"
          initialMessages={chatData.messages}
          partnerName={studentName}
          partnerLabel="학생"
          containerVariant="staff"
        />
      </div>
    </InboxFrame>
  );
}
