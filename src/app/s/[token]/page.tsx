import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { SURVEY_SECTIONS } from "@/lib/online/survey-template";
import {
  Camera,
  CalendarDays,
  ChevronRight,
  FileText,
  GraduationCap,
  LayoutGrid,
  Megaphone,
  MessageCircle,
  Moon,
  Podcast,
  ShieldAlert,
  ShieldCheck,
  SpellCheck,
  Utensils,
  Video,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { todayKST, cn } from "@/lib/utils";
import { calcPointBalance, pointsToKrw } from "@/lib/points";
import { getPortalBadgeCounts } from "@/lib/portal-badges";
import {
  Badge,
  ButtonLink,
  IconTile,
  ListRow,
  Notice,
  PRESS,
  ProgressBar,
  Section,
  SectionAction,
  buttonClass,
  dueInfo,
  type Tone,
} from "@/components/portal/ui";
import { TASK_STATUS } from "@/components/portal/status";
import { PwaInstallPrompt } from "./_components/pwa-install-prompt";

function greeting(): string {
  const h = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();
  if (h < 5) return "늦은 시간까지 수고 많아요";
  if (h < 12) return "좋은 아침이에요";
  if (h < 18) return "오후도 힘내요";
  return "오늘 하루도 고생했어요";
}

/** 오늘 KST 00:00 의 UTC 시각 */
function kstDayStart(): Date {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 60 * 60 * 1000);
}

function daysUntil(d: Date): number {
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000));
}

const KST_DATETIME: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

export default async function StudentPortalHomePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const { student } = session;
  const isOnline = student.isOnlineManaged;
  const root = `/s/${token}`;

  // 홈 카드는 온라인/오프라인 구분 없이 데이터 유무로 표시(완전 통일).
  // 오프라인 학생은 보통 빈 결과 → 해당 카드만 자연스럽게 숨겨짐.
  // 단, 초기 설문 카드는 온라인 온보딩 전용이라 isOnline 일 때만 노출.
  const [
    openQuestions,
    survey,
    taskCounts,
    nextTask,
    upcomingSessions,
    lunchMenuCount,
    examApplyOpenCount,
    contentCount,
    merits,
    redemptions,
    badges,
  ] = await Promise.all([
    prisma.studentQuestion.count({
      where: { studentId: student.id, status: { in: ["OPEN", "ANSWERED"] } },
    }),
    isOnline
      ? prisma.onboardingSurvey.findUnique({
          where: { studentId: student.id },
          select: { submittedAt: true, sections: true },
        })
      : Promise.resolve(null),
    prisma.performanceTask.groupBy({
      by: ["status"],
      where: { studentId: student.id },
      _count: { _all: true },
    }),
    prisma.performanceTask.findFirst({
      where: { studentId: student.id, status: { not: "DONE" } },
      orderBy: { dueDate: "asc" },
      select: { id: true, subject: true, title: true, dueDate: true, status: true },
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
    prisma.lunchMenu.count({
      where: { date: { gte: todayKST() }, closed: false },
    }),
    prisma.examSession.count({
      where: { applicationOpen: true, examDate: { gte: todayKST() } },
    }),
    prisma.contentPost.count({ where: { visible: true } }),
    prisma.meritDemerit.findMany({
      where: { studentId: student.id },
      select: { type: true, points: true },
    }),
    prisma.rewardRedemption.findMany({
      where: { studentId: student.id },
      select: { status: true, points: true },
    }),
    getPortalBadgeCounts(student.id),
  ]);

  const totalTasks = taskCounts.reduce((sum, c) => sum + c._count._all, 0);
  const doneTasks = taskCounts.find((c) => c.status === "DONE")?._count._all ?? 0;
  const openTasks = totalTasks - doneTasks;

  const sections =
    (survey?.sections as Record<string, { answer?: string }> | null) ?? null;
  const filledSections = sections
    ? SURVEY_SECTIONS.filter((s) => (sections[s.key]?.answer ?? "").trim().length > 0).length
    : 0;
  const surveySubmitted = !!survey?.submittedAt;

  const { balance } = calcPointBalance({ merits, redemptions });

  const daysLeft = daysUntil(session.link.expiresAt);

  const nextSession = upcomingSessions[0];
  const todayKstStart = kstDayStart();
  const tomorrowKst = new Date(todayKstStart.getTime() + 24 * 60 * 60 * 1000);
  const isToday =
    !!nextSession &&
    nextSession.scheduledAt >= todayKstStart &&
    nextSession.scheduledAt < tomorrowKst;

  const headline = isToday
    ? "오늘 멘토링이 있어요"
    : openTasks > 0
      ? `진행 중인 수행평가가 ${openTasks}건 있어요`
      : badges.qna > 0
        ? `질문에 새 답변이 ${badges.qna}건 왔어요`
        : "오늘도 한 걸음씩 가 봐요";

  const shortcuts: Shortcut[] = [
    { href: `${root}/nap`, label: "쪽잠 신청", icon: Moon, tone: "violet" },
    { href: `${root}/network`, label: "네트워크", icon: Wifi, tone: "info" },
    { href: `${root}/schedule`, label: "내 일정", icon: CalendarDays, tone: "ok" },
    { href: `${root}/suggestions`, label: "건의하기", icon: Megaphone, tone: "warn", badge: badges.suggestions },
  ];
  if (badges.hasVocab)
    shortcuts.push({ href: `${root}/vocab`, label: "영단어", icon: SpellCheck, tone: "info", badge: badges.vocab });
  if (isOnline || badges.feedback > 0)
    shortcuts.push({ href: `${root}/feedback`, label: "피드백", icon: MessageCircle, tone: "brand", badge: badges.feedback });
  if (contentCount > 0)
    shortcuts.push({ href: `${root}/contents`, label: "콘텐츠", icon: Podcast, tone: "violet" });
  shortcuts.push({ href: `${root}/menu`, label: "전체", icon: LayoutGrid, tone: "gray" });

  return (
    <div className="space-y-3">
      {/* 인사 */}
      <div className="px-1 pb-3 pt-2">
        <p className="t5-medium text-fg-neutral-subtle">
          {student.name}님, {greeting()}
        </p>
        <h2 className="t9-bold mt-1 text-fg-neutral">
          {headline}
        </h2>
      </div>

      {daysLeft <= 7 && (
        <Notice
          tone={daysLeft <= 3 ? "bad" : "warn"}
          icon={ShieldAlert}
          title={daysLeft === 0 ? "접속 링크가 오늘 만료돼요" : `접속 링크가 ${daysLeft}일 후 만료돼요`}
        >
          원장님께 새 링크를 요청해 주세요.
        </Notice>
      )}

      {/* 멘토링 */}
      {nextSession && (
        <Section
          title={isToday ? "오늘의 멘토링" : "다음 멘토링"}
          action={isToday ? <Badge tone="brand">오늘</Badge> : undefined}
        >
          <div className="flex items-center gap-3.5">
            <IconTile icon={Video} tone={isToday ? "brand" : "info"} solid={isToday} size={48} />
            <div className="min-w-0">
              <p className="t6-bold text-fg-neutral tabular-nums">
                {nextSession.scheduledAt.toLocaleString("ko-KR", KST_DATETIME)}
              </p>
              <p className="t4-regular mt-0.5 text-fg-neutral-subtle">
                {nextSession.durationMinutes}분 · {nextSession.host.name} 멘토
              </p>
            </div>
          </div>
          {nextSession.meetUrl ? (
            <ButtonLink
              href={nextSession.meetUrl}
              external
              variant={isToday ? "primary" : "weak"}
              size="lg"
              block
              className="mt-4"
            >
              <Video className="h-[18px] w-[18px]" strokeWidth={2.4} />
              Meet 입장하기
            </ButtonLink>
          ) : (
            <p className="t4-regular mt-4 rounded-r3_5 bg-bg-neutral-weak px-4 py-3 text-fg-neutral-subtle">
              Meet 링크는 곧 발급돼요.
            </p>
          )}
          {upcomingSessions.length > 1 && (
            <ul className="mt-4 space-y-1 border-t border-stroke-neutral-subtle pt-3">
              {upcomingSessions.slice(1).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-1.5">
                  <div className="min-w-0">
                    <p className="t5-medium text-fg-neutral-muted tabular-nums">
                      {s.scheduledAt.toLocaleString("ko-KR", KST_DATETIME)}
                    </p>
                    <p className="t3-regular text-fg-neutral-subtle">
                      {s.host.name} · {s.durationMinutes}분
                    </p>
                  </div>
                  {s.meetUrl && (
                    <ButtonLink href={s.meetUrl} external variant="gray" size="xs">
                      Meet
                    </ButtonLink>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* 질문하기 */}
      <Link href={`${root}/qna`} className={cn("block rounded-r5 bg-bg-layer-default p-5", PRESS)}>
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="t6-bold text-fg-neutral">모르는 문제가 있나요?</p>
            <p className="t4-regular mt-1 text-fg-neutral-subtle">
              {openQuestions > 0
                ? `질문 ${openQuestions}건이 진행 중이에요`
                : "사진만 찍어 올리면 근무 멘토가 풀이해 드려요"}
            </p>
          </div>
          <IconTile icon={Camera} tone="brand" solid size={48} round />
        </div>
        <span className={buttonClass({ variant: "weak", size: "md", block: true, className: "mt-4" })}>
          {badges.qna > 0 ? `새 답변 ${badges.qna}건 보기` : "사진으로 질문하기"}
        </span>
      </Link>

      {/* 지금 신청할 수 있어요 (시즌성) */}
      {(lunchMenuCount > 0 || examApplyOpenCount > 0) && (
        <Section title="지금 신청할 수 있어요" flush>
          {lunchMenuCount > 0 && (
            <ListRow
              href={`${root}/lunch`}
              leading={<IconTile icon={Utensils} tone="warn" />}
              title="점심 도시락 신청"
              description="먹을 날짜를 고르고 입금하면 확정돼요"
            />
          )}
          {examApplyOpenCount > 0 && (
            <ListRow
              href={`${root}/exam`}
              leading={<IconTile icon={GraduationCap} tone="violet" />}
              title="모의고사 신청"
              description={`접수 중인 시험 ${examApplyOpenCount}건`}
              trailing={<Badge tone="brand">접수 중</Badge>}
            />
          )}
        </Section>
      )}

      {/* 수행평가 */}
      {(isOnline || totalTasks > 0) && (
        <Section title="수행평가" action={<SectionAction href={`${root}/tasks`}>전체</SectionAction>}>
          <p className="t10-bold text-fg-neutral tabular-nums">
            {doneTasks}
            <span className="t6-bold text-fg-neutral-subtle"> / {totalTasks}건 완료</span>
          </p>
          <ProgressBar className="mt-3" value={totalTasks ? doneTasks / totalTasks : 0} />
          {nextTask && (
            <NextTaskCard
              href={`${root}/tasks/${nextTask.id}`}
              subject={nextTask.subject}
              title={nextTask.title}
              dueDate={nextTask.dueDate}
              status={nextTask.status}
            />
          )}
        </Section>
      )}

      {/* 초기 설문 — 온라인 온보딩 전용, 제출 전까지만 */}
      {isOnline && !surveySubmitted && (
        <Section>
          <div className="flex items-center gap-3.5">
            <IconTile icon={FileText} tone="violet" size={48} />
            <div className="min-w-0 flex-1">
              <p className="t6-bold text-fg-neutral">초기 설문</p>
              <p className="t4-regular mt-0.5 text-fg-neutral-subtle tabular-nums">
                {filledSections === 0
                  ? `${SURVEY_SECTIONS.length}개 질문 · 자동 저장돼요`
                  : `${filledSections} / ${SURVEY_SECTIONS.length} 작성`}
              </p>
            </div>
          </div>
          <ProgressBar className="mt-4" value={filledSections / SURVEY_SECTIONS.length} />
          <ButtonLink href={`${root}/survey`} variant="weak" size="md" block className="mt-4">
            {filledSections === 0 ? "설문 시작하기" : "이어서 작성하기"}
          </ButtonLink>
        </Section>
      )}

      {/* 포인트 */}
      <Link href={`${root}/points`} className={cn("block rounded-r5 bg-bg-layer-default p-5", PRESS)}>
        <div className="flex items-center justify-between">
          <p className="t5-medium text-fg-neutral-muted">내 포인트</p>
          <ChevronRight className="h-5 w-5 text-fg-placeholder" />
        </div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="t10-bold text-fg-neutral tabular-nums">
              {balance.toLocaleString("ko-KR")}점
            </p>
            <p className="t4-regular mt-0.5 text-fg-neutral-subtle tabular-nums">
              약 {pointsToKrw(balance).toLocaleString("ko-KR")}원 상당
            </p>
          </div>
          <span className={buttonClass({ variant: "gray", size: "sm" })}>교환하기</span>
        </div>
      </Link>

      {/* 바로가기 */}
      <Section title="바로가기">
        <ul className="grid grid-cols-4 gap-y-5">
          {shortcuts.map((s) => (
            <li key={s.href}>
              <ShortcutTile {...s} />
            </li>
          ))}
        </ul>
      </Section>

      <PwaInstallPrompt />

      <p className="t2-regular flex items-start justify-center gap-1.5 px-6 pt-5 text-center text-fg-placeholder">
        <ShieldCheck className="mt-[3px] h-3.5 w-3.5 shrink-0" />
        <span>
          본인 전용 링크예요. 다른 사람과 공유하지 말고,
          <br />
          의심되는 일이 생기면 바로 원장님께 알려 주세요.
        </span>
      </p>
    </div>
  );
}

type Shortcut = {
  href: string;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  badge?: number;
};

function ShortcutTile({ href, label, icon, tone, badge = 0 }: Shortcut) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 transition-transform duration-150 active:scale-[0.94]"
    >
      <span className="relative">
        <IconTile icon={icon} tone={tone} size={48} />
        {badge > 0 && (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-bg-brand-solid ring-2 ring-bg-layer-default" />
        )}
      </span>
      <span className="t3-medium text-fg-neutral-muted">{label}</span>
    </Link>
  );
}

function NextTaskCard({
  href,
  subject,
  title,
  dueDate,
  status,
}: {
  href: string;
  subject: string;
  title: string;
  dueDate: Date;
  status: keyof typeof TASK_STATUS;
}): ReactNode {
  const due = dueInfo(dueDate);
  return (
    <Link
      href={href}
      className={cn("mt-4 flex items-center gap-3 rounded-r4 bg-bg-layer-fill px-4 py-3.5", PRESS)}
    >
      <div className="min-w-0 flex-1">
        <p className="t3-medium text-fg-neutral-subtle">가장 급한 과제</p>
        <p className="t5-bold mt-0.5 truncate text-fg-neutral">{title}</p>
        <div className="mt-2 flex items-center gap-1">
          <Badge>{subject}</Badge>
          <Badge tone={TASK_STATUS[status].tone}>{TASK_STATUS[status].label}</Badge>
        </div>
      </div>
      <Badge tone={due.tone} size="md">
        {due.label}
      </Badge>
    </Link>
  );
}
