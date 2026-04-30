import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageCircle, ChevronRight } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import type { TaskFeedbackStatus } from "@/generated/prisma";
import { FeedbackMarkRead } from "../_components/feedback-mark-read";

const STATUS_LABEL: Record<TaskFeedbackStatus, string> = {
  COMMENT: "코멘트",
  NEEDS_REVISION: "수정 요청",
  APPROVED: "승인",
};

const STATUS_TONE: Record<TaskFeedbackStatus, string> = {
  COMMENT: "bg-canvas-2 text-ink-3",
  NEEDS_REVISION: "bg-bad-soft text-bad-ink",
  APPROVED: "bg-ok-soft text-ok-ink",
};

const STATUS_DOT: Record<TaskFeedbackStatus, string> = {
  COMMENT: "bg-ink-4",
  NEEDS_REVISION: "bg-bad",
  APPROVED: "bg-ok",
};

function avatarTone(name: string): string {
  const code = [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return `av-tone-${(code % 6) + 1}`;
}

function dateGroupLabel(d: Date): string {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstD = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const sameDay = (a: Date, b: Date) =>
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate();
  if (sameDay(kstNow, kstD)) return "오늘";
  const kstYesterday = new Date(kstNow.getTime() - 24 * 60 * 60 * 1000);
  if (sameDay(kstYesterday, kstD)) return "어제";
  if (kstNow.getUTCFullYear() === kstD.getUTCFullYear()) {
    return `${kstD.getUTCMonth() + 1}월 ${kstD.getUTCDate()}일`;
  }
  return `${kstD.getUTCFullYear()}. ${kstD.getUTCMonth() + 1}. ${kstD.getUTCDate()}`;
}

function timeLabel(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const h = kst.getUTCHours();
  const m = kst.getUTCMinutes();
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${ampm} ${h12}:${m.toString().padStart(2, "0")}`;
}

export default async function StudentFeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const feedbacks = await prisma.taskFeedback.findMany({
    where: { submission: { task: { studentId: session.student.id } } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      author: { select: { name: true } },
      submission: {
        select: {
          version: true,
          task: {
            select: {
              id: true,
              title: true,
              subject: true,
            },
          },
        },
      },
    },
  });

  const unreadCount = feedbacks.filter((f) => !f.readByStudentAt).length;
  const totalCount = feedbacks.length;

  // Group by date label (KST-based day)
  const groups = new Map<
    string,
    typeof feedbacks
  >();
  for (const fb of feedbacks) {
    const key = dateGroupLabel(fb.createdAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(fb);
  }

  return (
    <div className="space-y-4">
      <FeedbackMarkRead studentToken={token} hasUnread={unreadCount > 0} />

      {/* Hero */}
      <section className="rounded-[18px] bg-gradient-to-br from-info to-info-ink p-5 text-white shadow-md">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
          <MessageCircle className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <h2 className="mt-3 text-[20px] font-bold tracking-[-0.02em]">
          받은 피드백
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed opacity-95">
          {totalCount === 0
            ? "아직 받은 피드백이 없어요. 수행평가를 제출하면 컨설턴트·관리멘토가 답변을 남겨줍니다."
            : `총 ${totalCount}건${unreadCount > 0 ? ` · 새 피드백 ${unreadCount}건` : ""}`}
        </p>
      </section>

      {totalCount === 0 ? (
        <section className="rounded-[14px] border border-dashed border-line bg-canvas-2/40 px-5 py-12 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-panel text-ink-4">
            <MessageCircle className="h-6 w-6" />
          </span>
          <p className="mt-3 text-[13.5px] font-semibold text-ink-2">
            받은 피드백이 없어요
          </p>
          <p className="mt-1 text-[12px] text-ink-4">
            수행평가 결과물을 올리면 컨설턴트가 검토 후 피드백을 남깁니다.
          </p>
          <Link
            href={`/s/${token}/tasks`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-panel px-3.5 py-2 text-[12.5px] font-semibold text-ink-2 active:bg-canvas-2"
          >
            수행평가 보러 가기
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([dateLabel, items]) => (
            <section key={dateLabel}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">
                  {dateLabel}
                </span>
                <span className="h-px flex-1 bg-line" />
                <span className="text-[11px] tabular-nums text-ink-5">
                  {items.length}건
                </span>
              </div>

              <ul className="space-y-2.5">
                {items.map((fb) => {
                  const isUnread = !fb.readByStudentAt;
                  const tone = avatarTone(fb.author.name);
                  return (
                    <li key={fb.id}>
                      <Link
                        href={`/s/${token}/tasks/${fb.submission.task.id}`}
                        className={`block rounded-[14px] border bg-panel p-4 transition-colors active:bg-canvas-2 ${
                          isUnread
                            ? "border-brand/40 ring-1 ring-brand/15"
                            : "border-line"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white ${tone}`}
                            aria-hidden
                          >
                            {fb.author.name.slice(0, 1)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[13px] font-semibold text-ink">
                                {fb.author.name}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATUS_TONE[fb.status]}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[fb.status]}`}
                                />
                                {STATUS_LABEL[fb.status]}
                              </span>
                              {isUnread && (
                                <span className="ml-auto rounded-full bg-brand px-1.5 py-0.5 text-[9.5px] font-bold tracking-wider text-white">
                                  NEW
                                </span>
                              )}
                            </div>
                            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                              {fb.content}
                            </p>
                            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[11.5px] text-ink-4">
                                  <span className="rounded bg-canvas-2 px-1.5 py-0.5 text-[10.5px] text-ink-3">
                                    {fb.submission.task.subject}
                                  </span>
                                  <span className="ml-1.5 text-[11.5px] text-ink-3">
                                    {fb.submission.task.title}
                                  </span>
                                  <span className="ml-1 text-[10.5px] text-ink-5">
                                    · v{fb.submission.version}
                                  </span>
                                </p>
                              </div>
                              <span className="shrink-0 text-[11px] tabular-nums text-ink-5">
                                {timeLabel(fb.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
