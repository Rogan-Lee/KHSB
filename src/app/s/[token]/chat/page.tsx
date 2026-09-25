import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { listStudentChats } from "@/actions/online/portal-chat";
import { Avatar, Badge, CountBadge, EmptyState, ListRow, Section } from "@/components/portal/ui";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  CONSULTANT: "컨설턴트",
  MANAGER_MENTOR: "관리 멘토",
  STAFF: "운영조교",
  DIRECTOR: "원장",
  ADMIN: "관리자",
  SUPER_ADMIN: "관리자",
  MENTOR: "멘토",
  STUDENT: "학생",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`;
}

type StudentChat = Awaited<ReturnType<typeof listStudentChats>>[number];

function ChatRow({ chat: c, token }: { chat: StudentChat; token: string }) {
  const past = !c.isCurrentAssignee;
  const unread = c.unread > 0;
  const lastIsMine = c.lastMessage?.senderType === "STUDENT";
  const previewBase =
    c.lastMessage?.content || (c.lastMessage?.hasAttachments ? "첨부파일을 보냈어요" : "");
  const preview = c.lastMessage
    ? lastIsMine
      ? `나: ${previewBase}`
      : previewBase
    : "대화를 시작해 보세요";
  const time = timeAgo(c.lastMessageAt);

  return (
    <ListRow
      href={`/s/${token}/chat/${c.id}`}
      chevron={false}
      muted={past}
      leading={<Avatar name={c.staff.name} size={48} muted={past} />}
      title={
        <span className="flex min-w-0 items-center gap-x1_5">
          <span className="truncate">{c.staff.name}</span>
          <Badge size="xs">{ROLE_LABEL[c.staff.role] ?? "직원"}</Badge>
        </span>
      }
      description={
        <span
          className={cn(
            "line-clamp-1 break-all",
            unread ? "t4-medium text-fg-neutral-muted" : !c.lastMessage && "text-fg-placeholder"
          )}
        >
          {preview}
        </span>
      }
      trailing={
        time || unread ? (
          <div className="flex flex-col items-end gap-x1_5">
            {time && <span className="t3-regular tabular-nums text-fg-placeholder">{time}</span>}
            <CountBadge count={c.unread} />
          </div>
        ) : undefined
      }
    />
  );
}

export default async function StudentChatListPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const chats = await listStudentChats({ studentToken: token });
  const totalUnread = chats.reduce((sum, c) => sum + c.unread, 0);
  const current = chats.filter((c) => c.isCurrentAssignee);
  const past = chats.filter((c) => !c.isCurrentAssignee);

  if (chats.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={MessageCircle}
          title="아직 배정된 담당자가 없어요"
          description={"컨설턴트·관리 멘토·운영조교가 배정되면\n여기서 바로 대화할 수 있어요."}
        />
      </Section>
    );
  }

  return (
    <div className="flex flex-col gap-x3">
      {current.length > 0 && (
        <Section
          flush
          title="담당 선생님"
          description={
            totalUnread > 0
              ? `읽지 않은 메시지가 ${totalUnread}개 있어요`
              : "궁금한 건 언제든 편하게 물어보세요"
          }
        >
          {current.map((c) => (
            <ChatRow key={c.id} chat={c} token={token} />
          ))}
        </Section>
      )}

      {past.length > 0 && (
        <Section
          flush
          title="이전 담당자"
          description={current.length === 0 ? "지금은 배정된 담당자가 없어요" : undefined}
        >
          {past.map((c) => (
            <ChatRow key={c.id} chat={c} token={token} />
          ))}
        </Section>
      )}
    </div>
  );
}
