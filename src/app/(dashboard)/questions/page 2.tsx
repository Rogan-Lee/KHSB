export const revalidate = 15;

import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpCircle, Paperclip, UserCheck, Link2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { listStaffQuestionInbox } from "@/actions/student-questions";
import type { StudentQuestionStatus } from "@/generated/prisma";

const STATUS_LABEL: Record<StudentQuestionStatus, string> = {
  OPEN: "미답변",
  ANSWERED: "답변함",
  RESOLVED: "해결됨",
  ARCHIVED: "보관",
};
const STATUS_TONE: Record<StudentQuestionStatus, string> = {
  OPEN: "bg-amber-100 text-amber-800",
  ANSWERED: "bg-emerald-100 text-emerald-800",
  RESOLVED: "bg-slate-100 text-slate-600",
  ARCHIVED: "bg-slate-100 text-slate-500",
};

type Filter = "open" | "mine" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "미답변" },
  { key: "mine", label: "내가 담당" },
  { key: "all", label: "전체" },
];

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function StaffQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (!isStaff(session.user.role)) redirect("/");

  const sp = await searchParams;
  const filter: Filter =
    sp.filter === "mine" ? "mine" : sp.filter === "all" ? "all" : "open";
  const questions = await listStaffQuestionInbox({ filter });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-1 flex items-center gap-2">
        <HelpCircle className="h-5 w-5 text-brand" />
        <h1 className="text-xl font-bold tracking-tight">학생 질문</h1>
        <Link
          href="/questions/links"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium hover:bg-accent"
        >
          <Link2 className="h-3.5 w-3.5" />
          학생 링크 관리
        </Link>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        재원생이 올린 문제 질문 — 당일 근무 멘토가 풀이를 답해주세요. (공용 받은함)
      </p>

      <div className="mb-4 flex gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/questions${f.key === "open" ? "" : `?filter=${f.key}`}`}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-brand text-white"
                : "border bg-background text-muted-foreground hover:bg-accent"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {questions.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 px-6 py-16 text-center">
          <HelpCircle className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">
            {filter === "open"
              ? "미답변 질문이 없어요"
              : filter === "mine"
                ? "내가 담당한 질문이 없어요"
                : "질문이 없어요"}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {questions.map((q) => (
            <li key={q.id}>
              <Link
                href={`/questions/${q.id}`}
                className="block rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[q.status]}`}
                  >
                    {STATUS_LABEL[q.status]}
                  </span>
                  {q.subject && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {q.subject}
                    </span>
                  )}
                  <span className="text-[13px] font-medium text-foreground">
                    {q.student.name}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    {q.student.grade}
                    {q.student.school ? ` · ${q.student.school}` : ""}
                  </span>
                  {q.lastMessage?.hasAttachments && (
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {q.claimedBy && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          q.claimedByMe
                            ? "bg-brand/10 text-brand"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        <UserCheck className="h-3 w-3" />
                        {q.claimedByMe ? "내 담당" : q.claimedBy.name}
                      </span>
                    )}
                    {q.unread > 0 && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
                        {q.unread}
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-[15px] font-semibold leading-snug">{q.title}</p>
                {q.lastMessage && (
                  <p className="mt-1 line-clamp-1 text-[13px] text-muted-foreground">
                    {q.lastMessage.senderType === "STAFF" ? "나/멘토: " : "학생: "}
                    {q.lastMessage.content || (q.lastMessage.hasAttachments ? "📷 사진" : "")}
                  </p>
                )}
                <p className="mt-2 text-[12px] tabular-nums text-muted-foreground">
                  {fmt(q.lastMessageAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
