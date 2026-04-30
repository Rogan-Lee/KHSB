import { redirect } from "next/navigation";
import Link from "next/link";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { SURVEY_SECTIONS } from "@/lib/online/survey-template";
import {
  ChevronRight,
  ClipboardList,
  FileText,
  Video,
  CalendarClock,
  Sparkles,
  ShieldAlert,
  ArrowUpRight,
} from "lucide-react";
import type { PerformanceTaskStatus } from "@/generated/prisma";
import { PwaInstallPrompt } from "./_components/pwa-install-prompt";

const STATUS_LABEL: Record<PerformanceTaskStatus, string> = {
  OPEN: "진행 전",
  IN_PROGRESS: "진행 중",
  SUBMITTED: "제출 완료",
  NEEDS_REVISION: "수정 필요",
  DONE: "최종 완료",
};

const STATUS_TONE: Record<PerformanceTaskStatus, string> = {
  OPEN: "bg-canvas-2 text-ink-3",
  IN_PROGRESS: "bg-info-soft text-info-ink",
  SUBMITTED: "bg-warn-soft text-warn-ink",
  NEEDS_REVISION: "bg-bad-soft text-bad-ink",
  DONE: "bg-ok-soft text-ok-ink",
};

function greeting(): string {
  const h = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();
  if (h < 5) return "늦은 시간이네요";
  if (h < 12) return "좋은 아침이에요";
  if (h < 18) return "오후도 화이팅";
  return "저녁이에요";
}

export default async function StudentPortalHomePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const { student } = session;

  const [survey, taskCounts, nextTask, upcomingSessions] = await Promise.all([
    prisma.onboardingSurvey.findUnique({
      where: { studentId: student.id },
      select: { submittedAt: true, sections: true },
    }),
    prisma.performanceTask.groupBy({
      by: ["status"],
      where: { studentId: student.id },
      _count: { _all: true },
    }),
    prisma.performanceTask.findFirst({
      where: { studentId: student.id, status: { not: "DONE" } },
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        subject: true,
        title: true,
        dueDate: true,
        status: true,
      },
    }),
    prisma.mentoringSession.findMany({
      where: {
        studentId: student.id,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        scheduledAt: { gte: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
      take: 3,
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        durationMinutes: true,
        meetUrl: true,
        host: { select: { name: true } },
      },
    }),
  ]);

  const totalTasks = taskCounts.reduce((sum, c) => sum + c._count._all, 0);
  const doneTasks =
    taskCounts.find((c) => c.status === "DONE")?._count._all ?? 0;
  const openTasks = totalTasks - doneTasks;

  const sections =
    (survey?.sections as Record<string, { answer?: string }> | null) ?? null;
  const filledSections = sections
    ? SURVEY_SECTIONS.filter(
        (s) => (sections[s.key]?.answer ?? "").trim().length > 0
      ).length
    : 0;
  const surveySubmitted = !!survey?.submittedAt;

  const todaysSession = upcomingSessions[0];
  const todayKstStart = (() => {
    const d = new Date();
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    kst.setUTCHours(0, 0, 0, 0);
    return new Date(kst.getTime() - 9 * 60 * 60 * 1000);
  })();
  const tomorrowKst = new Date(
    todayKstStart.getTime() + 24 * 60 * 60 * 1000
  );
  const isToday =
    todaysSession &&
    todaysSession.scheduledAt >= todayKstStart &&
    todaysSession.scheduledAt < tomorrowKst;

  return (
    <div className="space-y-4">
      {/* Greeting hero */}
      <section className="rounded-[18px] bg-gradient-to-br from-brand to-brand-2 p-5 text-white shadow-md">
        <p className="text-[12px] font-medium opacity-90">{greeting()}</p>
        <h2 className="mt-1 text-[22px] font-bold tracking-[-0.02em]">
          {student.name}님 👋
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed opacity-95">
          {openTasks > 0
            ? `오늘 처리할 수행평가 ${openTasks}건이 있어요.`
            : "처리할 과제가 없어요. 잠시 쉬어가도 좋아요."}
        </p>
      </section>

      {/* Today's session — prominent if happening today */}
      {todaysSession && (
        <section
          className={`rounded-[14px] border bg-panel p-4 ${
            isToday
              ? "border-brand/40 ring-1 ring-brand/20"
              : "border-line"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                isToday ? "bg-brand text-white" : "bg-info-soft text-info-ink"
              }`}
            >
              <CalendarClock className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-4">
              {isToday ? "오늘의 멘토링" : "다음 멘토링"}
            </p>
          </div>
          <p className="mt-2.5 text-[15px] font-semibold text-ink">
            {todaysSession.scheduledAt.toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
              month: "long",
              day: "numeric",
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </p>
          <p className="mt-1 text-[12.5px] text-ink-4">
            {todaysSession.durationMinutes}분 · {todaysSession.host.name} 멘토
          </p>
          {todaysSession.meetUrl ? (
            <a
              href={todaysSession.meetUrl}
              target="_blank"
              rel="noopener"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-ok px-4 py-3 text-[14px] font-semibold text-white active:scale-[0.98] transition-transform"
            >
              <Video className="h-4 w-4" strokeWidth={2.5} />
              Meet 입장하기
            </a>
          ) : (
            <p className="mt-3 rounded-[10px] bg-canvas-2 px-3 py-2 text-[12px] text-ink-4">
              Meet 링크가 곧 발급됩니다.
            </p>
          )}
        </section>
      )}

      {/* Next urgent task */}
      {nextTask && (
        <Link
          href={`/s/${token}/tasks/${nextTask.id}`}
          className="block rounded-[14px] border border-line bg-panel p-4 active:bg-canvas-2 transition-colors"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-4">
              가장 급한 수행평가
            </p>
            <DueChip dueDate={nextTask.dueDate} />
          </div>
          <p className="mt-2 text-[15px] font-semibold text-ink leading-snug">
            {nextTask.title}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full bg-canvas-2 px-2 py-0.5 text-[10.5px] font-medium text-ink-3">
              {nextTask.subject}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATUS_TONE[nextTask.status]}`}
            >
              {STATUS_LABEL[nextTask.status]}
            </span>
            <span className="ml-auto inline-flex items-center text-[12px] font-medium text-brand">
              열기
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
          </div>
        </Link>
      )}

      {/* Progress widgets — 2-up grid */}
      <section className="grid grid-cols-2 gap-3">
        <Link
          href={`/s/${token}/tasks`}
          className="rounded-[14px] border border-line bg-panel p-3.5 active:bg-canvas-2 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-info-soft text-info-ink">
              <ClipboardList className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            <p className="text-[11px] font-semibold text-ink-4">수행평가</p>
          </div>
          <p className="mt-2.5 text-[20px] font-bold tracking-[-0.02em] text-ink tabular-nums">
            {doneTasks}
            <span className="text-[13px] font-medium text-ink-4">
              {" "}
              / {totalTasks}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-ink-4">
            {openTasks > 0 ? `${openTasks}건 진행중` : "모두 완료"}
          </p>
          <ProgressBar value={totalTasks ? doneTasks / totalTasks : 0} />
        </Link>

        <Link
          href={`/s/${token}/survey`}
          className="rounded-[14px] border border-line bg-panel p-3.5 active:bg-canvas-2 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-soft text-violet-ink">
              <FileText className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            <p className="text-[11px] font-semibold text-ink-4">초기 설문</p>
          </div>
          <p className="mt-2.5 text-[20px] font-bold tracking-[-0.02em] text-ink tabular-nums">
            {filledSections}
            <span className="text-[13px] font-medium text-ink-4">
              {" "}
              / {SURVEY_SECTIONS.length}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-ink-4">
            {surveySubmitted
              ? "제출 완료"
              : filledSections === 0
                ? "작성 시작"
                : "이어서 작성"}
          </p>
          <ProgressBar value={filledSections / SURVEY_SECTIONS.length} />
        </Link>
      </section>

      {/* Upcoming sessions list (excluding today's hero) */}
      {upcomingSessions.length > 1 && (
        <section className="rounded-[14px] border border-line bg-panel p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-ink-4" />
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-4">
              예정된 세션 {upcomingSessions.length - 1}건
            </p>
          </div>
          <ul className="mt-3 space-y-2">
            {upcomingSessions.slice(1).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-[10px] bg-canvas-2 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-ink">
                    {s.scheduledAt.toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                      month: "numeric",
                      day: "numeric",
                      weekday: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </p>
                  <p className="text-[11px] text-ink-4">
                    {s.host.name} · {s.durationMinutes}분
                  </p>
                </div>
                {s.meetUrl && (
                  <a
                    href={s.meetUrl}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 rounded-[8px] border border-line bg-panel px-2.5 py-1.5 text-[11.5px] font-semibold text-ink active:bg-canvas-2"
                  >
                    Meet
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* PWA install prompt */}
      <PwaInstallPrompt />

      {/* Safety notice */}
      <section className="rounded-[14px] border border-line bg-canvas-2/50 p-3.5">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" />
          <div>
            <p className="text-[12px] font-semibold text-ink-2">
              본인 전용 링크
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-4">
              외부 공유 시 개인 정보가 노출될 수 있어요. 의심되는 상황이 생기면
              즉시 원장님께 알려 주세요.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="mt-2 h-1 w-full rounded-full bg-canvas-2 overflow-hidden">
      <div
        className="h-full rounded-full bg-brand transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function DueChip({ dueDate }: { dueDate: Date }) {
  const days = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const tone =
    days < 0
      ? "bg-bad-soft text-bad-ink"
      : days <= 1
        ? "bg-warn-soft text-warn-ink"
        : days <= 3
          ? "bg-warn-soft/70 text-warn-ink"
          : "bg-canvas-2 text-ink-3";
  const label =
    days < 0 ? `D+${-days}` : days === 0 ? "D-Day" : `D-${days}`;
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold tabular-nums ${tone}`}
    >
      {label}
    </span>
  );
}
