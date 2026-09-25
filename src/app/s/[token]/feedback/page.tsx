import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { FeedbackMarkRead } from "../_components/feedback-mark-read";
import {
  Avatar,
  Badge,
  ButtonLink,
  EmptyState,
  GroupLabel,
  IconTile,
  Section,
} from "@/components/portal/ui";
import { FEEDBACK_STATUS } from "@/components/portal/status";

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
  return `${kstD.getUTCFullYear()}년 ${kstD.getUTCMonth() + 1}월 ${kstD.getUTCDate()}일`;
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
  const groups = new Map<string, typeof feedbacks>();
  for (const fb of feedbacks) {
    const key = dateGroupLabel(fb.createdAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(fb);
  }

  return (
    <div className="flex flex-col gap-x3">
      <FeedbackMarkRead studentToken={token} hasUnread={unreadCount > 0} />

      {totalCount === 0 ? (
        <Section>
          <EmptyState
            icon={MessageCircle}
            tone="info"
            title="받은 피드백이 없어요"
            description={"수행평가를 제출하면 컨설턴트가 검토하고\n피드백을 남겨줘요."}
            action={
              <ButtonLink href={`/s/${token}/tasks`} variant="weak" size="md">
                수행평가 보러 가기
              </ButtonLink>
            }
            className="py-x8"
          />
        </Section>
      ) : (
        <>
          {/* 요약 */}
          <Section>
            <div className="flex items-center gap-x3_5">
              <IconTile
                icon={MessageCircle}
                tone={unreadCount > 0 ? "brand" : "info"}
                size={48}
                round
              />
              <div className="min-w-0">
                <p className="t6-bold text-fg-neutral">
                  {unreadCount > 0
                    ? `새 피드백 ${unreadCount}건이 도착했어요`
                    : "피드백을 모두 확인했어요"}
                </p>
                <p className="mt-x0_5 t4-regular tabular-nums text-fg-neutral-subtle">
                  지금까지 받은 피드백 총 {totalCount}건
                </p>
              </div>
            </div>
          </Section>

          {[...groups.entries()].map(([dateLabel, items]) => (
            <div key={dateLabel} className="pt-x2">
              <GroupLabel trailing={`${items.length}건`}>{dateLabel}</GroupLabel>
              <Section flush>
                {items.map((fb) => {
                  const isUnread = !fb.readByStudentAt;
                  const st = FEEDBACK_STATUS[fb.status];
                  return (
                    <Link
                      key={fb.id}
                      href={`/s/${token}/tasks/${fb.submission.task.id}`}
                      className="mx-x2 flex w-[calc(100%-16px)] items-start gap-x3_5 rounded-r4 px-x3 py-x3_5 text-left transition-colors duration-color-transition active:bg-bg-transparent-pressed"
                    >
                      <Avatar name={fb.author.name} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-x1_5">
                          <span className="truncate t5-bold text-fg-neutral">
                            {fb.author.name}
                          </span>
                          <Badge tone={st.tone} size="xs">
                            {st.label}
                          </Badge>
                          {isUnread && (
                            <span className="ml-x0_5 size-x2 shrink-0 rounded-full bg-bg-brand-solid">
                              <span className="sr-only">새 피드백</span>
                            </span>
                          )}
                        </div>
                        <p className="mt-x1 line-clamp-3 whitespace-pre-wrap break-words t5-regular text-fg-neutral-muted">
                          {fb.content}
                        </p>
                        <p className="mt-x1_5 flex min-w-0 items-center gap-x1 t3-regular text-fg-neutral-subtle">
                          <span className="truncate">
                            {fb.submission.task.subject} · {fb.submission.task.title}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            · v{fb.submission.version} · {timeLabel(fb.createdAt)}
                          </span>
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </Section>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
