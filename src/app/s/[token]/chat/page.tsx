import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageSquare, ChevronRight } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { listStudentChats } from "@/actions/online/portal-chat";

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

function avatarTone(name: string): string {
  const code = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return `av-tone-${(code % 6) + 1}`;
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

  return (
    <div className="space-y-3">
      <section className="rounded-[18px] bg-gradient-to-br from-info to-info-ink p-5 text-white shadow-md">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
          <MessageSquare className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <h2 className="mt-3 text-[20px] font-bold tracking-[-0.02em]">
          담당자와 메시지
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed opacity-95">
          {chats.length === 0
            ? "아직 배정된 담당자가 없어요. 원장님께 문의해 주세요."
            : `${chats.length}명의 담당자${
                totalUnread > 0 ? ` · 새 메시지 ${totalUnread}건` : ""
              }`}
        </p>
      </section>

      {chats.length === 0 ? (
        <section className="rounded-[14px] border border-dashed border-line bg-canvas-2/40 px-5 py-10 text-center">
          <p className="text-[13px] font-semibold text-ink-2">
            배정된 담당자가 없어요
          </p>
          <p className="mt-1 text-[12px] text-ink-4">
            컨설턴트·관리멘토·운영조교가 배정되면 여기에 채팅방이 생성돼요.
          </p>
        </section>
      ) : (
        <ul className="space-y-2">
          {chats.map((c) => {
            const tone = avatarTone(c.staff.name);
            const lastIsMine = c.lastMessage?.senderType === "STUDENT";
            const previewBase = c.lastMessage?.hasAttachments
              ? "📎 첨부파일"
              : c.lastMessage?.content;
            const preview = c.lastMessage
              ? lastIsMine
                ? `나: ${previewBase}`
                : previewBase
              : "대화를 시작해 보세요";
            return (
              <li key={c.id}>
                <Link
                  href={`/s/${token}/chat/${c.id}`}
                  className={`flex items-center gap-3 rounded-[14px] border bg-panel p-3.5 transition-colors active:bg-canvas-2 ${
                    c.unread > 0 ? "border-brand/40 ring-1 ring-brand/15" : "border-line"
                  }`}
                >
                  <span
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white ${tone}`}
                    aria-hidden
                  >
                    {c.staff.name.slice(0, 1)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-semibold text-ink">
                        {c.staff.name}
                      </p>
                      <span className="rounded-full bg-canvas-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-3">
                        {ROLE_LABEL[c.staff.role] ?? "직원"}
                      </span>
                      <span className="ml-auto shrink-0 text-[10.5px] text-ink-5 tabular-nums">
                        {timeAgo(c.lastMessageAt)}
                      </span>
                    </div>
                    <p
                      className={`mt-0.5 truncate text-[12.5px] ${
                        c.unread > 0 ? "font-semibold text-ink-2" : "text-ink-4"
                      }`}
                    >
                      {preview}
                    </p>
                  </div>
                  {c.unread > 0 ? (
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold tabular-nums text-white">
                      {c.unread > 99 ? "99+" : c.unread}
                    </span>
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-5" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
