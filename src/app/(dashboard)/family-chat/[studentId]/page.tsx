import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getFamilyChat, listFamilyChats } from "@/actions/family-chat";
import { Avatar } from "@/components/backoffice/ui";
import { FamilyChatFrame } from "@/components/family-chat/family-chat-frame";
import { FamilyChatView } from "@/components/family-chat/family-chat-view";
import { FamilyRoomList } from "@/components/family-chat/room-list";
import { prisma } from "@/lib/prisma";
import { isFullAccess } from "@/lib/roles";
import { requireDashboardSession } from "../../_lib/page-guard";

export const metadata = { title: "가족 톡방" };

export default async function FamilyChatRoomPage({ params }: { params: Promise<{ studentId: string }> }) {
  const session = await requireDashboardSession();
  const { studentId } = await params;

  // 없는 학생 id 로 방을 만들지 않게 먼저 확인한다 (퇴원생 방은 목록에 없어도 링크로 열 수 있다)
  const [exists, rooms] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId }, select: { id: true } }),
    listFamilyChats(),
  ]);
  if (!exists) notFound();
  const thread = await getFamilyChat({ studentId });
  const members = thread.members;
  if (!members) notFound();

  // 목록과 대화를 같이 읽어 순서가 엇갈려도, 지금 연 방은 읽음으로 보인다
  const listed = rooms.map((r) => (r.studentId === studentId ? { ...r, unread: false } : r));
  const { student, parents } = members;
  const meta = [student.grade, student.school].filter(Boolean).join(" · ");
  const memberLine = ["학생", ...parents.map((p) => p.name), "운영진 전체"].join(" · ");

  return (
    <FamilyChatFrame mode="chat" list={<FamilyRoomList rooms={listed} />}>
      <header className="flex h-x14 shrink-0 items-center gap-x2 border-b border-stroke-neutral-muted bg-bg-layer-default px-x2 md:px-x5">
        <Link
          href="/family-chat"
          aria-label="톡방 목록으로"
          className="grid size-x10 shrink-0 place-items-center rounded-r2 text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed md:hidden"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <Avatar name={student.name} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate">
            <span className="t5-bold text-fg-neutral">{student.name}</span>
            {meta && <span className="ml-x1_5 t2-regular text-fg-neutral-subtle">{meta}</span>}
          </p>
          <p className="truncate t2-regular text-fg-neutral-subtle">{memberLine}</p>
        </div>
      </header>
      {parents.length === 0 && (
        <p className="shrink-0 border-b border-stroke-neutral-muted bg-bg-neutral-weak px-x4 py-x2 t3-regular text-fg-neutral-muted md:px-x5">
          연결된 학부모가 없어요. 학부모 앱 초대는{" "}
          {isFullAccess(session.user.role) ? (
            <Link href="/admin/auth" className="t3-medium text-fg-brand underline-offset-2 hover:underline">
              계정 초대
            </Link>
          ) : (
            "원장님이 계정 초대"
          )}
          에서 할 수 있어요.
        </p>
      )}
      <div className="min-h-0 flex-1">
        <FamilyChatView
          key={studentId}
          studentId={studentId}
          chatId={thread.chatId}
          initialMessages={thread.messages}
          initialHasMore={thread.hasMore}
        />
      </div>
    </FamilyChatFrame>
  );
}
