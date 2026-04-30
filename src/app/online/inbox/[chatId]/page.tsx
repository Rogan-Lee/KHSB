import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getUser } from "@/lib/auth";
import { isOnlineStaff } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import {
  getChatMessages,
  listStaffInbox,
} from "@/actions/online/portal-chat";
import { InboxListPanel } from "@/components/online/chat/inbox-list-panel";
import { ChatView } from "@/components/online/chat/chat-view";

export default async function StaffInboxChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  if (!isOnlineStaff(user.role)) redirect("/online");

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

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -m-6">
      <aside className="hidden md:block md:w-96 md:border-r md:border-line">
        <InboxListPanel
          chats={chats}
          totalUnread={totalUnread}
          staffRole={user.role}
          className="h-full"
        />
      </aside>
      <section className="flex flex-1 flex-col bg-canvas">
        <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2.5 md:hidden">
          <Link
            href="/online/inbox"
            aria-label="목록으로"
            className="-ml-1.5 inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 active:bg-canvas-2"
          >
            <ChevronLeft className="h-[22px] w-[22px]" />
          </Link>
          <p className="text-[14px] font-semibold text-ink">
            {chatData.chat.student.name}
          </p>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatView
            chatId={chatId}
            viewer="STAFF"
            initialMessages={chatData.messages}
            partnerName={chatData.chat.student.name}
            partnerLabel="학생"
            containerVariant="staff"
          />
        </div>
      </section>
    </div>
  );
}
