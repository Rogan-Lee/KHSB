import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { getUser } from "@/lib/auth";
import { isAnyStaff } from "@/lib/roles";
import { listStaffInbox } from "@/actions/online/portal-chat";
import { InboxListPanel } from "@/components/online/chat/inbox-list-panel";
import { EmptyState } from "@/components/backoffice/ui";
import { InboxFrame } from "./_components/inbox-frame";

export const metadata = { title: "학생 메시지" };

export default async function StaffInboxPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  if (!isAnyStaff(user.role)) redirect("/");

  const chats = await listStaffInbox();
  const totalUnread = chats.reduce((sum, c) => sum + c.unread, 0);

  return (
    <InboxFrame
      mode="list"
      list={
        <InboxListPanel
          chats={chats}
          totalUnread={totalUnread}
          staffRole={user.role}
          className="h-full"
        />
      }
    >
      <EmptyState
        icon={MessageCircle}
        title="대화를 선택해 주세요"
        description="왼쪽 목록에서 학생을 고르면 대화가 여기에 열려요."
        className="h-full bg-bg-layer-fill"
      />
    </InboxFrame>
  );
}
