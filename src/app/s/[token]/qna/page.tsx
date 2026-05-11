import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, ChevronRight, Camera, HelpCircle } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { listStudentQuestions } from "@/actions/student-questions";
import type { StudentQuestionStatus } from "@/generated/prisma";

const STATUS_LABEL: Record<StudentQuestionStatus, string> = {
  OPEN: "답변 대기",
  ANSWERED: "답변 완료",
  RESOLVED: "해결됨",
  ARCHIVED: "보관됨",
};
const STATUS_TONE: Record<StudentQuestionStatus, string> = {
  OPEN: "bg-warn-soft text-warn-ink",
  ANSWERED: "bg-ok-soft text-ok-ink",
  RESOLVED: "bg-canvas-2 text-ink-3",
  ARCHIVED: "bg-canvas-2 text-ink-4",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function StudentQnaListPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const questions = await listStudentQuestions({ studentToken: token });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-bold tracking-[-0.02em] text-ink">질문</h1>
        <Link
          href={`/s/${token}/qna/new`}
          className="inline-flex items-center gap-1 rounded-full bg-brand px-3.5 py-2 text-[13px] font-semibold text-white active:scale-[0.98] transition-transform"
        >
          <Plus className="h-4 w-4" strokeWidth={2.8} />
          질문하기
        </Link>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line bg-canvas-2/40 px-5 py-12 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-panel text-ink-4">
            <HelpCircle className="h-6 w-6" />
          </span>
          <p className="mt-3 text-[13.5px] font-semibold text-ink-2">아직 질문이 없어요</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-4">
            모르는 문제를 사진으로 찍어 올리면
            <br />
            근무 멘토가 풀이를 답해드려요.
          </p>
          <Link
            href={`/s/${token}/qna/new`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white active:scale-[0.98] transition-transform"
          >
            <Camera className="h-4 w-4" strokeWidth={2.4} />
            첫 질문 올리기
          </Link>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {questions.map((q) => (
            <li key={q.id}>
              <Link
                href={`/s/${token}/qna/${q.id}`}
                className="block rounded-[14px] border border-line bg-panel p-4 active:bg-canvas-2 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  {q.subject && (
                    <span className="rounded-full bg-canvas-2 px-2 py-0.5 text-[10.5px] font-medium text-ink-3">
                      {q.subject}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATUS_TONE[q.status]}`}
                  >
                    {STATUS_LABEL[q.status]}
                  </span>
                  {q.unread > 0 && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">
                      새 답변 {q.unread}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[15px] font-semibold leading-snug text-ink">{q.title}</p>
                {q.lastMessage && (
                  <p className="mt-1 line-clamp-1 text-[12.5px] text-ink-4">
                    {q.lastMessage.senderType === "STAFF" ? "멘토: " : ""}
                    {q.lastMessage.content ||
                      (q.lastMessage.hasAttachments ? "📷 사진" : "")}
                  </p>
                )}
                <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2.5">
                  <span className="text-[11.5px] tabular-nums text-ink-4">
                    {fmtDate(q.lastMessageAt)}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-ink-4" strokeWidth={2.5} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
