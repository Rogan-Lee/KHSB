import Link from "next/link";
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  Users,
  LinkIcon,
  ClipboardCheck,
  MessageSquare,
  Calendar,
} from "lucide-react";
import { ROLE_DISPLAY, isManagerMentor, isFullAccess, isConsultant } from "@/lib/roles";
import { todayKST } from "@/lib/utils";

export default async function OnlineHomePage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const today = todayKST();
  const in3Days = new Date(today);
  in3Days.setDate(in3Days.getDate() + 3);

  const isMM = isManagerMentor(user.role);
  const isCons = isConsultant(user.role);
  const isFA = isFullAccess(user.role);

  // 관리 멘토: 본인 담당 학생만. 원장: 전체.
  const myStudentFilter = isMM && !isFA
    ? { assignedMentorId: user.id }
    : isCons && !isFA
      ? { assignedConsultantId: user.id }
      : {};

  const [
    onlineStudentCount,
    activeMagicLinkCount,
    myStudents,
    tasksDueSoon,
    pendingFeedbackCount,
    todayLogsCount,
    unreadParentFeedbackCount,
  ] = await Promise.all([
    prisma.student.count({ where: { isOnlineManaged: true, status: "ACTIVE" } }),
    prisma.studentMagicLink.count({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
    }),
    prisma.student.findMany({
      where: {
        isOnlineManaged: true,
        status: "ACTIVE",
        ...myStudentFilter,
      },
      select: {
        id: true,
        dailyKakaoLogs: isMM ? { where: { logDate: today }, take: 1 } : false,
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
          where: {
            authorId: user.id,
            logDate: today,
          },
        })
      : Promise.resolve(0),
    isFA
      ? prisma.onlineParentFeedback.count({ where: { readAt: null } })
      : Promise.resolve(0),
  ]);

  const unrecorded = isMM
    ? myStudents.filter((s) => (s.dailyKakaoLogs?.length ?? 0) === 0).length
    : 0;

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

      {/* 관리 멘토 전용 "오늘 할 일" 섹션 */}
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
          {todayLogsCount > 0 && (
            <p className="text-[11px] text-emerald-700">
              ✅ 오늘 {todayLogsCount}명 작성 완료
            </p>
          )}
        </section>
      )}

      {/* 컨설턴트 전용 "오늘 할 일" — 피드백 대기 중심 */}
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

      {/* 원장/SUPER_ADMIN 전용 "오늘 할 일" — 학부모 피드백 + 피드백 대기 */}
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label="온라인 학생"
          value={onlineStudentCount}
          suffix="명"
          icon={<Users className="h-4 w-4 text-ink-3" />}
          href="/online/students"
        />
        <StatCard
          label="활성 매직링크"
          value={activeMagicLinkCount}
          suffix="건"
          icon={<LinkIcon className="h-4 w-4 text-ink-3" />}
          href="/online/students"
        />
        <StatCard
          label="수행평가 피드백 대기"
          value={pendingFeedbackCount}
          suffix="건"
          icon={<ClipboardCheck className="h-4 w-4 text-ink-3" />}
          href="/online/performance?status=SUBMITTED"
        />
      </div>

      <section className="rounded-[12px] border border-line bg-panel p-4">
        <h2 className="text-[13px] font-semibold text-ink">
          Phase 1 MVP 현재 범위
        </h2>
        <ul className="mt-2 space-y-1 text-[12px] text-ink-4 leading-relaxed">
          <li>
            <MessageSquare className="inline h-3 w-3 mr-1" />
            A-1 초기 설문 · A-2 수행평가 일정 · A-3 과제 업로드+피드백
          </li>
          <li>
            <Calendar className="inline h-3 w-3 mr-1" />
            B-1 과목별 진도 · B-2 주간 계획 · B-4 카톡 일일 보고
          </li>
          <li>
            Sprint 4 예정: C 학부모 주간 보고서 초안 + 토큰 링크 발송
          </li>
        </ul>
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
        <span className={`font-semibold tabular-nums ${highlight ? "text-amber-900" : "text-ink"}`}>
          {value}
          {total != null && <span className="text-ink-5 font-normal"> / {total}</span>}
        </span>
      </div>
    </Link>
  );
}

function StatCard({
  label,
  value,
  suffix,
  icon,
  href,
  hint,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon?: React.ReactNode;
  href?: string;
  hint?: string;
}) {
  const body = (
    <div className="rounded-[12px] border border-line bg-panel p-4 hover:border-line-strong transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-ink-4">{label}</span>
        {icon}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-[24px] font-semibold text-ink tabular-nums">
          {value.toLocaleString()}
        </span>
        {suffix && <span className="text-[12px] text-ink-4">{suffix}</span>}
      </div>
      {hint && <p className="mt-1 text-[11px] text-ink-5">{hint}</p>}
    </div>
  );

  if (href) return <Link href={href}>{body}</Link>;
  return body;
}
