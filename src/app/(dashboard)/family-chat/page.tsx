import { MessagesSquare } from "lucide-react";
import { listFamilyChats } from "@/actions/family-chat";
import { EmptyState } from "@/components/backoffice/ui";
import { FamilyChatFrame } from "@/components/family-chat/family-chat-frame";
import { FamilyRoomList } from "@/components/family-chat/room-list";
import { requireDashboardSession } from "../_lib/page-guard";

export const metadata = { title: "가족 톡방" };

export default async function FamilyChatPage() {
  await requireDashboardSession();
  const rooms = await listFamilyChats();

  return (
    <FamilyChatFrame mode="list" list={<FamilyRoomList rooms={rooms} />}>
      <EmptyState
        icon={MessagesSquare}
        title="대화를 선택해 주세요"
        description="학생을 고르면 대화가 열려요."
        className="h-full bg-bg-layer-fill"
      />
    </FamilyChatFrame>
  );
}
