export const revalidate = 15;

import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircleQuestion, Paperclip, UserCheck, Link2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { listStaffQuestionInbox } from "@/actions/student-questions";
import type { StudentQuestionStatus } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  CountBadge,
  EmptyState,
  LinkTabs,
  PageHeader,
  StatusBadge,
  type Tone,
} from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<StudentQuestionStatus, string> = {
  OPEN: "미답변",
  ANSWERED: "답변함",
  RESOLVED: "해결됨",
  ARCHIVED: "보관",
};
const STATUS_TONE: Record<StudentQuestionStatus, Tone> = {
  OPEN: "warn",
  ANSWERED: "ok",
  RESOLVED: "gray",
  ARCHIVED: "gray",
};

type Filter = "open" | "mine" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "미답변" },
  { key: "mine", label: "내가 담당" },
  { key: "all", label: "전체" },
];

const EMPTY_TEXT: Record<Filter, { title: string; description: string }> = {
  open: { title: "미답변 질문이 없어요", description: "학생이 새 질문을 올리면 여기에 먼저 보여요." },
  mine: { title: "내가 담당한 질문이 없어요", description: "질문을 열고 ‘담당하기’를 누르면 여기에 모여요." },
  all: { title: "아직 질문이 없어요", description: "학생 포털 링크로 질문을 받을 수 있어요." },
};

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
  const empty = EMPTY_TEXT[filter];

  return (
    <>
      <PageHeader
        title="학생 질문"
        description="재원생이 올린 문제 질문이에요. 당일 근무 멘토가 풀이를 답해 주세요. (공용 받은함)"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/students?tab=portal-links">
              <Link2 />
              학생 링크 관리
            </Link>
          </Button>
        }
      />

      <LinkTabs
        current={filter}
        items={FILTERS.map((f) => ({
          value: f.key,
          label: f.label,
          href: `/questions${f.key === "open" ? "" : `?filter=${f.key}`}`,
          count: f.key === filter ? questions.length : undefined,
        }))}
      />

      {questions.length === 0 ? (
        <div className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
          <EmptyState icon={MessageCircleQuestion} title={empty.title} description={empty.description} />
        </div>
      ) : (
        <ul className="divide-y divide-stroke-neutral-muted overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
          {questions.map((q) => {
            const unread = q.unread > 0;
            return (
              <li key={q.id}>
                <Link
                  href={`/questions/${q.id}`}
                  className="flex items-start gap-x3 px-x5 py-x4 transition-colors hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring"
                >
                  <Avatar name={q.student.name} size={40} className="mt-x0_5" />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x1_5">
                      <StatusBadge tone={STATUS_TONE[q.status]}>{STATUS_LABEL[q.status]}</StatusBadge>
                      {q.subject && <StatusBadge tone="gray">{q.subject}</StatusBadge>}
                      <span className="t4-medium text-fg-neutral">{q.student.name}</span>
                      <span className="t3-regular text-fg-neutral-subtle">
                        {q.student.grade}
                        {q.student.school ? ` · ${q.student.school}` : ""}
                      </span>
                    </div>

                    <p className={cn("mt-x1_5 truncate t5-medium text-fg-neutral", unread && "t5-bold")}>{q.title}</p>

                    {q.lastMessage && (
                      <p className="mt-x0_5 flex min-w-0 items-center gap-x1 t4-regular text-fg-neutral-subtle">
                        {q.lastMessage.hasAttachments && <Paperclip className="size-3.5 shrink-0" aria-label="첨부 있음" />}
                        <span className="truncate">
                          <span className="text-fg-neutral-muted">
                            {q.lastMessage.senderType === "STAFF" ? "나/멘토" : "학생"}
                          </span>
                          {" · "}
                          {q.lastMessage.content || (q.lastMessage.hasAttachments ? "사진" : "")}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-x1_5">
                    <span className={cn("t3-regular tabular-nums", unread ? "text-fg-brand" : "text-fg-neutral-subtle")}>
                      {fmt(q.lastMessageAt)}
                    </span>
                    <div className="flex items-center gap-x1_5">
                      {q.claimedBy && (
                        <StatusBadge tone={q.claimedByMe ? "brand" : "gray"}>
                          <UserCheck />
                          {q.claimedByMe ? "내 담당" : q.claimedBy.name}
                        </StatusBadge>
                      )}
                      {unread && <CountBadge count={q.unread} />}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
