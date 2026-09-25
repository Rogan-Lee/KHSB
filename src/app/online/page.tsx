import Link from "next/link";
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  Users,
  ClipboardCheck,
  MessageSquare,
  MessageSquareText,
  FileText,
  CalendarClock,
  CheckCircle2,
  PenLine,
  Plus,
  Video,
  type LucideIcon,
} from "lucide-react";
import {
  ROLE_DISPLAY,
  isManagerMentor,
  isFullAccess,
  isConsultant,
  isOnlineStaff,
} from "@/lib/roles";
import { cn, todayKST } from "@/lib/utils";
import { mondayOfKST } from "@/lib/online/week";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  IconTile,
  ListItem,
  PageHeader,
  Section,
  StatCard,
  StatCards,
  StatusBadge,
} from "@/components/backoffice/ui";

type Todo = {
  label: string;
  hint: string;
  value: number;
  /** "n / total명" 으로 보여 줄 분모 */
  total?: number;
  href: string;
  /** 0 보다 크면 주의 색으로 강조 */
  highlight: boolean;
  icon: LucideIcon;
};

export default async function OnlineHomePage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  // 온라인 대시보드는 온라인 직원 전용 (레이아웃은 전 직원 허용으로 완화됨)
  if (!isOnlineStaff(user.role)) redirect("/");

  const today = todayKST();
  const in3Days = new Date(today);
  in3Days.setDate(in3Days.getDate() + 3);

  const weekStartIso = mondayOfKST();
  const weekStartDate = new Date(weekStartIso + "T00:00:00.000Z");

  const isMM = isManagerMentor(user.role);
  const isCons = isConsultant(user.role);
  const isFA = isFullAccess(user.role);

  // 관리 멘토: 본인 담당 학생만. 컨설턴트: 본인 담당. 원장: 전체.
  const myStudentFilter =
    isMM && !isFA
      ? { assignedMentorId: user.id }
      : isCons && !isFA
        ? { assignedConsultantId: user.id }
        : {};

  const [
    onlineStudentCount,
    activeMagicLinkCount,
    myStudents,
    activeTaskCount,
    tasksDueSoon,
    pendingFeedbackCount,
    todayLogsByMe,
    todayLogsAll,
    weeklyReportsCreated,
    weeklyReportsSent,
    unreadParentFeedbackCount,
  ] = await Promise.all([
    prisma.student.count({
      where: { isOnlineManaged: true, status: "ACTIVE", ...myStudentFilter },
    }),
    prisma.studentMagicLink.count({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
    }),
    isMM
      ? prisma.student.findMany({
          where: {
            isOnlineManaged: true,
            status: "ACTIVE",
            ...myStudentFilter,
          },
          select: {
            id: true,
            dailyKakaoLogs: { where: { logDate: today }, take: 1 },
          },
        })
      : Promise.resolve([]),
    prisma.performanceTask.count({
      where: {
        student: { isOnlineManaged: true, status: "ACTIVE", ...myStudentFilter },
        status: { in: ["OPEN", "IN_PROGRESS", "NEEDS_REVISION"] },
      },
    }),
    prisma.performanceTask.count({
      where: {
        student: { isOnlineManaged: true, status: "ACTIVE", ...myStudentFilter },
        dueDate: { gte: today, lte: in3Days },
        status: { in: ["OPEN", "IN_PROGRESS", "NEEDS_REVISION"] },
      },
    }),
    prisma.performanceTask.count({
      where: {
        student: { isOnlineManaged: true, status: "ACTIVE", ...myStudentFilter },
        status: "SUBMITTED",
      },
    }),
    isMM
      ? prisma.dailyKakaoLog.count({
          where: { authorId: user.id, logDate: today },
        })
      : Promise.resolve(0),
    prisma.dailyKakaoLog.count({
      where: {
        logDate: today,
        student: { isOnlineManaged: true, status: "ACTIVE" },
      },
    }),
    prisma.onlineParentReport.count({
      where: { type: "WEEKLY", periodStart: weekStartDate },
    }),
    prisma.onlineParentReport.count({
      where: { type: "WEEKLY", periodStart: weekStartDate, status: "SENT" },
    }),
    isFA
      ? prisma.onlineParentFeedback.count({ where: { readAt: null } })
      : Promise.resolve(0),
  ]);

  // 화상 1:1 세션 카운트 (역할별 가시성 동일하게 적용)
  const studentScopeForSessions = {
    isOnlineManaged: true,
    status: "ACTIVE" as const,
    ...myStudentFilter,
  };
  const [upcomingSessionCount, todaySessionCount, completedSessionCount] =
    await Promise.all([
      prisma.mentoringSession.count({
        where: {
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
          scheduledAt: { gte: new Date() },
          student: studentScopeForSessions,
        },
      }),
      prisma.mentoringSession.count({
        where: {
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
          scheduledAt: {
            gte: today,
            lte: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          },
          student: studentScopeForSessions,
        },
      }),
      prisma.mentoringSession.count({
        where: {
          status: "COMPLETED",
          scheduledAt: { gte: weekStartDate },
          student: studentScopeForSessions,
        },
      }),
    ]);

  const unrecorded = isMM
    ? myStudents.filter((s) => (s.dailyKakaoLogs?.length ?? 0) === 0).length
    : 0;

  // 전체 온라인 학생 수 (담당자에게도 분모용으로 필요)
  const totalOnlineStudents = isFA
    ? onlineStudentCount
    : await prisma.student.count({
        where: { isOnlineManaged: true, status: "ACTIVE" },
      });

  // ─── 역할별 "오늘 할 일" ───
  const todos: Todo[] = isFA
    ? [
        {
          label: "학부모 피드백 미확인",
          hint: "학부모가 리포트에 남긴 의견 중 아직 읽지 않은 것",
          value: unreadParentFeedbackCount,
          href: "/online/reports",
          highlight: unreadParentFeedbackCount > 0,
          icon: MessageSquareText,
        },
        {
          label: "컨설턴트 피드백 대기",
          hint: "학생이 제출해 컨설턴트 피드백을 기다리는 수행평가",
          value: pendingFeedbackCount,
          href: "/online/performance?status=SUBMITTED",
          highlight: false,
          icon: ClipboardCheck,
        },
      ]
    : isCons
      ? [
          {
            label: "피드백 대기",
            hint: "학생이 제출해 내 피드백을 기다리는 수행평가",
            value: pendingFeedbackCount,
            href: "/online/performance?status=SUBMITTED",
            highlight: pendingFeedbackCount > 0,
            icon: ClipboardCheck,
          },
          {
            label: "D-3 이내 수행평가",
            hint: "3일 안에 마감되는 진행 중 과제",
            value: tasksDueSoon,
            href: "/online/performance",
            highlight: false,
            icon: CalendarClock,
          },
        ]
      : isMM && myStudents.length > 0
        ? [
            {
              label: "일일 보고 미기록",
              hint: "오늘 카톡 보고가 아직 없는 담당 학생",
              value: unrecorded,
              total: myStudents.length,
              href: "/online/daily-log",
              highlight: unrecorded > 0,
              icon: MessageSquare,
            },
            {
              label: "D-3 이내 수행평가",
              hint: "3일 안에 마감되는 진행 중 과제",
              value: tasksDueSoon,
              href: "/online/performance",
              highlight: tasksDueSoon > 0,
              icon: CalendarClock,
            },
            {
              label: "컨설턴트 피드백 대기",
              hint: "학생이 제출해 컨설턴트 피드백을 기다리는 수행평가",
              value: pendingFeedbackCount,
              href: "/online/performance?status=SUBMITTED",
              highlight: false,
              icon: ClipboardCheck,
            },
          ]
        : [];
  const attentionCount = todos.filter((t) => t.highlight).length;

  const todayLabel = today.toLocaleDateString("ko-KR", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  const roleLabel = ROLE_DISPLAY[user.role] ?? user.role;
  const canOpenDailyLog = isMM || isFA;

  return (
    <div>
      <PageHeader
        title="온라인 관리"
        meta={<StatusBadge tone="gray">{roleLabel}</StatusBadge>}
        description={
          <>
            {isFA ? "전체 온라인 학생" : `${user.name}님 담당 학생`} 기준 ·{" "}
            <span className="tabular-nums">{todayLabel}</span>
          </>
        }
        actions={
          isMM ? (
            <Button asChild>
              <Link href="/online/daily-log">
                <PenLine />
                오늘 보고 작성
              </Link>
            </Button>
          ) : isFA ? (
            <>
              <Button asChild variant="outline">
                <Link href="/online/reports">이번 주 보고서 보기</Link>
              </Button>
              <Button asChild>
                <Link href="/online/students">
                  <Plus />
                  학생 추가
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild>
              <Link href="/online/performance?status=SUBMITTED">피드백 대기 과제 보기</Link>
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-x6">
        {/* 요약 지표 */}
        <StatCards cols={4}>
          <StatCard
            label={isFA ? "온라인 학생" : "담당 학생"}
            value={onlineStudentCount.toLocaleString()}
            unit="명"
            sub={
              isFA
                ? `활성 매직링크 ${activeMagicLinkCount.toLocaleString()}건`
                : `전체 온라인 ${totalOnlineStudents.toLocaleString()}명`
            }
            href="/online/students"
          />
          <StatCard
            label="진행 중 수행평가"
            value={activeTaskCount.toLocaleString()}
            unit="건"
            sub={`D-3 이내 마감 ${tasksDueSoon.toLocaleString()}건`}
            href="/online/performance"
          />
          <StatCard
            label={isMM ? "내 오늘 일일 보고" : "오늘 일일 보고"}
            value={(isMM ? todayLogsByMe : todayLogsAll).toLocaleString()}
            unit={`/ ${(isMM ? myStudents.length : totalOnlineStudents).toLocaleString()}명`}
            sub={
              isMM
                ? unrecorded > 0
                  ? `미기록 ${unrecorded}명`
                  : "담당 학생 모두 작성했어요"
                : "전체 온라인 학생 기준"
            }
            href={canOpenDailyLog ? "/online/daily-log" : undefined}
          />
          <StatCard
            label="오늘 화상 세션"
            value={todaySessionCount.toLocaleString()}
            unit="건"
            sub={`예정 ${upcomingSessionCount}건 · 이번 주 완료 ${completedSessionCount}건`}
            href="/online/sessions"
          />
        </StatCards>

        <div className="grid grid-cols-1 items-start gap-x6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* 오늘 할 일 / 원장 확인 필요 */}
          <Section
            title={isFA ? "원장 확인 필요" : "오늘 할 일"}
            description={
              todos.length === 0
                ? undefined
                : attentionCount > 0
                  ? `바로 확인이 필요한 항목이 ${attentionCount}개 있어요`
                  : "지금 급하게 처리할 일은 없어요"
            }
            flush
          >
            {todos.length === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title="배정된 담당 학생이 아직 없어요"
                description="담당 학생이 배정되면 오늘 할 일이 여기에 모여요"
              />
            ) : (
              <>
                <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                  {todos.map((t) => (
                    <li key={t.label}>
                      <ListItem
                        href={t.href}
                        className="py-x4"
                        leading={<IconTile icon={t.icon} tone={t.highlight ? "warn" : "gray"} size={40} />}
                        title={t.label}
                        description={t.hint}
                        trailing={<TodoValue todo={t} />}
                      />
                    </li>
                  ))}
                </ul>
                {isMM && todayLogsByMe > 0 && (
                  <p className="flex items-center gap-x1_5 border-t border-stroke-neutral-muted px-x5 py-x3 t3-medium text-fg-positive">
                    <CheckCircle2 className="size-4" aria-hidden />
                    오늘 {todayLogsByMe}명 작성 완료
                  </p>
                )}
              </>
            )}
          </Section>

          {/* 기능 바로 가기 */}
          <Section title="바로 가기" flush>
            <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
              <li>
                <ListItem
                  href="/online/students"
                  leading={<IconTile icon={Users} size={32} />}
                  title={isFA ? "학생 등록" : "담당 학생"}
                  description={isFA ? "온라인 학생 등록 · 매직링크 관리" : "담당 학생 목록"}
                />
              </li>
              <li>
                <ListItem
                  href="/online/performance"
                  leading={<IconTile icon={ClipboardCheck} size={32} />}
                  title="수행평가"
                  description="새 수행평가 발행 · 제출물 피드백"
                />
              </li>
              <li>
                <ListItem
                  href="/online/daily-log"
                  leading={<IconTile icon={MessageSquare} size={32} />}
                  title="일일 보고"
                  description={isMM ? "오늘 카톡 보고 작성" : "오늘의 학생별 카톡 보고 모음"}
                />
              </li>
              <li>
                <ListItem
                  href="/online/reports"
                  leading={<IconTile icon={FileText} size={32} />}
                  title="학부모 리포트"
                  description={
                    <span className="tabular-nums">
                      이번 주 생성 {weeklyReportsCreated}/{totalOnlineStudents}명 · 발송 {weeklyReportsSent}건
                    </span>
                  }
                />
              </li>
              <li>
                <ListItem
                  href="/online/sessions"
                  leading={<IconTile icon={Video} size={32} />}
                  title="화상 1:1 세션"
                  description="세션 예약·관리 · Meet 자동 예약 · 노트 AI 요약"
                />
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function TodoValue({ todo }: { todo: Todo }) {
  const tone = todo.highlight
    ? "text-fg-warning"
    : todo.value > 0
      ? "text-fg-neutral"
      : "text-fg-neutral-subtle";
  return (
    <span className="inline-flex items-baseline gap-x0_5 tabular-nums">
      <span className={cn("t6-bold", tone)}>{todo.value.toLocaleString()}</span>
      <span className="t3-regular text-fg-neutral-subtle">
        {todo.total != null ? `/ ${todo.total}명` : "건"}
      </span>
    </span>
  );
}
