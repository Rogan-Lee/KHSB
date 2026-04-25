import Link from "next/link";
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  Users,
  ClipboardCheck,
  MessageSquare,
  FileText,
  ArrowRight,
  Plus,
  AlertCircle,
} from "lucide-react";
import {
  ROLE_DISPLAY,
  isManagerMentor,
  isFullAccess,
  isConsultant,
} from "@/lib/roles";
import { todayKST } from "@/lib/utils";
import { mondayOfKST } from "@/lib/online/week";

export default async function OnlineHomePage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

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

  const unrecorded = isMM
    ? myStudents.filter((s) => (s.dailyKakaoLogs?.length ?? 0) === 0).length
    : 0;

  // 전체 온라인 학생 수 (담당자에게도 분모용으로 필요)
  const totalOnlineStudents = isFA
    ? onlineStudentCount
    : await prisma.student.count({
        where: { isOnlineManaged: true, status: "ACTIVE" },
      });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          온라인 관리
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          {user.name} · {ROLE_DISPLAY[user.role] ?? user.role}
        </p>
      </header>

      {/* 관리 멘토 전용 "오늘 할 일" */}
      {isMM && myStudents.length > 0 && (
        <section className="rounded-[12px] border border-line bg-panel p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-ink">오늘 할 일</h2>
            <span className="text-[11px] text-ink-5 tabular-nums">
              {today.toLocaleDateString("ko-KR")}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <TaskRow
              href="/online/daily-log"
              label="일일 보고 미기록"
              value={unrecorded}
              total={myStudents.length}
              highlight={unrecorded > 0}
            />
            <TaskRow
              href="/online/performance"
              label="D-3 이내 수행평가"
              value={tasksDueSoon}
              total={null}
              highlight={tasksDueSoon > 0}
            />
            <TaskRow
              href="/online/performance?status=SUBMITTED"
              label="컨설턴트 피드백 대기"
              value={pendingFeedbackCount}
              total={null}
              highlight={false}
              subtle
            />
          </div>
          {todayLogsByMe > 0 && (
            <p className="text-[11px] text-emerald-700">
              ✅ 오늘 {todayLogsByMe}명 작성 완료
            </p>
          )}
        </section>
      )}

      {/* 컨설턴트 전용 "오늘 할 일" */}
      {isCons && !isFA && (
        <section className="rounded-[12px] border border-line bg-panel p-4 space-y-2">
          <h2 className="text-[13px] font-semibold text-ink">오늘 할 일</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <TaskRow
              href="/online/performance?status=SUBMITTED"
              label="피드백 대기"
              value={pendingFeedbackCount}
              total={null}
              highlight={pendingFeedbackCount > 0}
            />
            <TaskRow
              href="/online/performance"
              label="D-3 이내 수행평가"
              value={tasksDueSoon}
              total={null}
              highlight={false}
              subtle
            />
          </div>
        </section>
      )}

      {/* 원장 전용 "확인 필요" */}
      {isFA && (
        <section className="rounded-[12px] border border-line bg-panel p-4 space-y-2">
          <h2 className="text-[13px] font-semibold text-ink">원장 확인 필요</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <TaskRow
              href="/online/reports"
              label="학부모 피드백 미확인"
              value={unreadParentFeedbackCount}
              total={null}
              highlight={unreadParentFeedbackCount > 0}
            />
            <TaskRow
              href="/online/performance?status=SUBMITTED"
              label="컨설턴트 피드백 대기"
              value={pendingFeedbackCount}
              total={null}
              highlight={false}
              subtle
            />
          </div>
        </section>
      )}

      {/* 4개 기능 카드 — 보고/관리/이동 */}
      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold text-ink-3 px-1">
          기능별 현황
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 1) 학생 등록 */}
          <FeatureCard
            href="/online/students"
            icon={<Users className="h-5 w-5" />}
            title="학생 등록"
            subtitle={
              isFA
                ? "온라인 학생 등록·매직링크 관리"
                : "담당 학생 목록"
            }
            metrics={[
              {
                label: isFA ? "온라인 학생" : "담당 학생",
                value: onlineStudentCount,
                suffix: "명",
              },
              ...(isFA
                ? [
                    {
                      label: "활성 매직링크",
                      value: activeMagicLinkCount,
                      suffix: "건",
                    },
                  ]
                : []),
            ]}
            primaryAction={
              isFA
                ? { label: "학생 추가", href: "/online/students" }
                : null
            }
          />

          {/* 2) 수행평가 */}
          <FeatureCard
            href="/online/performance"
            icon={<ClipboardCheck className="h-5 w-5" />}
            title="수행평가"
            subtitle="과제 발행 · 제출물 피드백"
            metrics={[
              {
                label: "진행 중",
                value: activeTaskCount,
                suffix: "건",
              },
              {
                label: "피드백 대기",
                value: pendingFeedbackCount,
                suffix: "건",
                urgent: pendingFeedbackCount > 0,
                href: "/online/performance?status=SUBMITTED",
              },
              {
                label: "D-3 이내 마감",
                value: tasksDueSoon,
                suffix: "건",
                urgent: tasksDueSoon > 0,
              },
            ]}
            primaryAction={{
              label: "새 수행평가",
              href: "/online/performance",
            }}
          />

          {/* 3) 일일 보고 */}
          <FeatureCard
            href="/online/daily-log"
            icon={<MessageSquare className="h-5 w-5" />}
            title="일일 보고"
            subtitle={
              isMM
                ? "오늘 카톡 보고 작성"
                : "오늘의 학생별 카톡 보고 모음"
            }
            metrics={
              isMM
                ? [
                    {
                      label: "내가 오늘 작성",
                      value: todayLogsByMe,
                      total: myStudents.length,
                      suffix: "명",
                      urgent: unrecorded > 0,
                    },
                  ]
                : [
                    {
                      label: "오늘 작성됨 (전체)",
                      value: todayLogsAll,
                      total: totalOnlineStudents,
                      suffix: "명",
                    },
                  ]
            }
            primaryAction={
              isMM
                ? { label: "오늘 보고 작성", href: "/online/daily-log" }
                : null
            }
          />

          {/* 4) 학부모 리포트 */}
          <FeatureCard
            href="/online/reports"
            icon={<FileText className="h-5 w-5" />}
            title="학부모 리포트"
            subtitle="주간 보고서 초안 · 검토 · 발송"
            metrics={[
              {
                label: "이번 주 생성",
                value: weeklyReportsCreated,
                total: totalOnlineStudents,
                suffix: "명",
              },
              {
                label: "이번 주 발송",
                value: weeklyReportsSent,
                suffix: "건",
              },
              ...(isFA
                ? [
                    {
                      label: "학부모 피드백 미확인",
                      value: unreadParentFeedbackCount,
                      suffix: "건",
                      urgent: unreadParentFeedbackCount > 0,
                    },
                  ]
                : []),
            ]}
            primaryAction={
              isFA
                ? { label: "이번 주 보고서 보기", href: "/online/reports" }
                : null
            }
          />
        </div>
      </section>
    </div>
  );
}

function TaskRow({
  href,
  label,
  value,
  total,
  highlight,
  subtle,
}: {
  href: string;
  label: string;
  value: number;
  total: number | null;
  highlight: boolean;
  subtle?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-[10px] border px-3 py-2 text-[12.5px] transition-colors ${
        highlight
          ? "border-amber-300 bg-amber-50 hover:border-amber-400"
          : subtle
            ? "border-line bg-canvas-2/50 hover:border-line-strong"
            : "border-line bg-panel hover:border-line-strong"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={highlight ? "text-amber-900" : "text-ink"}>{label}</span>
        <span
          className={`font-semibold tabular-nums ${highlight ? "text-amber-900" : "text-ink"}`}
        >
          {value}
          {total != null && (
            <span className="text-ink-5 font-normal"> / {total}</span>
          )}
        </span>
      </div>
    </Link>
  );
}

type Metric = {
  label: string;
  value: number;
  suffix?: string;
  total?: number;
  urgent?: boolean;
  href?: string;
};

function FeatureCard({
  href,
  icon,
  title,
  subtitle,
  metrics,
  primaryAction,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  metrics: Metric[];
  primaryAction: { label: string; href: string } | null;
}) {
  const hasUrgent = metrics.some((m) => m.urgent);
  return (
    <div
      className={`group rounded-[12px] border bg-panel p-4 transition-colors flex flex-col gap-3 ${
        hasUrgent
          ? "border-amber-300 hover:border-amber-400"
          : "border-line hover:border-line-strong"
      }`}
    >
      <Link href={href} className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`grid place-items-center w-9 h-9 rounded-[10px] shrink-0 ${
              hasUrgent
                ? "bg-amber-100 text-amber-700"
                : "bg-canvas-2 text-ink-3"
            }`}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-ink leading-tight">
              {title}
            </h3>
            <p className="mt-0.5 text-[11.5px] text-ink-5 leading-tight">
              {subtitle}
            </p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-ink-4 group-hover:text-ink-2 mt-2 shrink-0" />
      </Link>

      <div className="space-y-1">
        {metrics.map((m) =>
          m.href ? (
            <Link
              key={m.label}
              href={m.href}
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-[12.5px] transition-colors ${
                m.urgent
                  ? "bg-amber-50 hover:bg-amber-100"
                  : "hover:bg-canvas-2/60"
              }`}
            >
              <span className={m.urgent ? "text-amber-900" : "text-ink-3"}>
                {m.label}
              </span>
              <MetricValue m={m} />
            </Link>
          ) : (
            <div
              key={m.label}
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-[12.5px] ${
                m.urgent ? "bg-amber-50" : ""
              }`}
            >
              <span className={m.urgent ? "text-amber-900" : "text-ink-3"}>
                {m.label}
              </span>
              <MetricValue m={m} />
            </div>
          )
        )}
      </div>

      {primaryAction && (
        <Link
          href={primaryAction.href}
          className="inline-flex items-center justify-center gap-1 rounded-[8px] border border-line bg-canvas-2 hover:bg-canvas hover:border-line-strong px-3 py-1.5 text-[12px] font-medium text-ink-2 transition-colors mt-auto"
        >
          <Plus className="h-3.5 w-3.5" />
          {primaryAction.label}
        </Link>
      )}
    </div>
  );
}

function MetricValue({ m }: { m: Metric }) {
  return (
    <span className="inline-flex items-center gap-1">
      {m.urgent && m.value > 0 && (
        <AlertCircle className="h-3 w-3 text-amber-600" />
      )}
      <span
        className={`font-semibold tabular-nums ${m.urgent ? "text-amber-900" : "text-ink"}`}
      >
        {m.value.toLocaleString()}
        {m.total != null && (
          <span className="text-ink-5 font-normal"> / {m.total}</span>
        )}
        {m.suffix && (
          <span
            className={`ml-0.5 font-normal text-[11px] ${m.urgent ? "text-amber-700" : "text-ink-5"}`}
          >
            {m.suffix}
          </span>
        )}
      </span>
    </span>
  );
}
