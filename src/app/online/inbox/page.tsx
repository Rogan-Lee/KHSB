import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { getUser } from "@/lib/auth";
import { isOnlineStaff } from "@/lib/roles";
import { listStaffInbox } from "@/actions/online/portal-chat";
import { InboxListPanel } from "@/components/online/chat/inbox-list-panel";

export const metadata = { title: "학생 메시지 · 온라인 관리" };

export default async function StaffInboxPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  if (!isOnlineStaff(user.role)) redirect("/online");

  const chats = await listStaffInbox();
  const totalUnread = chats.reduce((sum, c) => sum + c.unread, 0);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -m-6">
      <aside className="w-full md:w-96 md:border-r md:border-line">
        <InboxListPanel
          chats={chats}
          totalUnread={totalUnread}
          staffRole={user.role}
          className="h-full"
        />
      </aside>
      <section className="hidden md:flex flex-1 items-center justify-center bg-canvas">
        <div className="text-center">
          <MessageCircle className="mx-auto h-10 w-10 text-ink-5" />
          <p className="mt-3 text-[14px] font-semibold text-ink-3">
            왼쪽에서 학생을 선택하세요
          </p>
          <p className="mt-1 text-[12px] text-ink-4">
            대화 화면이 여기에 표시됩니다.
          </p>
        </div>
      </section>
    </div>
  );
}
