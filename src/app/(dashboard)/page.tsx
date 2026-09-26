export const revalidate = 30;

import { prisma } from "@/lib/prisma";
import { isFullAccess } from "@/lib/roles";
import { formatDate, formatTime, todayKST } from "@/lib/utils";
import { Activity, CalendarDays, MessageSquare } from "lucide-react";
import {
  EmptyState,
  ListItem,
  Section,
  SectionLink,
  StatCard,
  StatCards,
  StatusBadge,
  type Tone,
} from "@/components/backoffice/ui";
import { getRecentHandovers, getStaffList } from "@/actions/handover";
import { getChecklistTemplates } from "@/actions/checklist-templates";
import { getMonthlyNotes } from "@/actions/monthly-notes";
import { getTodos } from "@/actions/todos";
import { getAllAssignmentStatus, getEnrollmentDelta } from "@/actions/dashboard-widgets";
import { getActivePatrolRoundBrief } from "@/actions/patrol";
import { getAttentionStudents } from "@/lib/attention";
import { DashboardWrapper } from "@/components/dashboard/dashboard-wrapper";
import { AllAssignmentsWidget } from "@/components/dashboard/all-assignments-widget";
import { EnrollmentDeltaWidget } from "@/components/dashboard/enrollment-delta-widget";
import { PatrolStartWidget } from "@/components/dashboard/patrol-start-widget";
import { AttentionWidget } from "@/components/dashboard/attention-widget";
import { requireDashboardSession } from "./_lib/page-guard";

/** "9월 26일 (금)" — 예정 일정 날짜 표시용 */
function formatMonthDay(date: Date | string) {
  return new Date(date).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  });
}

export default async function DashboardPage() {
  const session = await requireDashboardSession();
  const today = todayKST();
  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth() + 1;

  const [
    totalActive,
    todayAttendances,
    upcomingMentorings,
    recentMerits,
    upcomingConsultations,
    recentHandovers,
    templates,
    monthlyNotes,
    students,
    staffList,
    todos,
    allAssignments,
    enrollmentDelta,
    activePatrolRound,
    attentionStudents,
  ] = await Promise.all([
    prisma.student.count({ where: { status: "ACTIVE" } }),
    prisma.attendanceRecord.findMany({
      where: { date: today },
      include: { student: { select: { name: true, seat: true } } },
    }),
    prisma.mentoring.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: { gte: kstNow },
        ...(session?.user?.role === "MENTOR" ? { mentorId: session.user.id } : {}),
      },
      include: {
        student: { select: { name: true, grade: true } },
        mentor: { select: { name: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 6,
    }),
    prisma.meritDemerit.findMany({
      include: { student: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.directorConsultation.findMany({
      where: { status: "SCHEDULED" },
      include: { student: { select: { name: true, grade: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    getRecentHandovers(7),
    getChecklistTemplates(),
    getMonthlyNotes(year, month),
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true },
      orderBy: { name: "asc" },
    }),
    getStaffList(),
    getTodos(),
    getAllAssignmentStatus(),
    getEnrollmentDelta(year, month),
    getActivePatrolRoundBrief(),
    getAttentionStudents(),
  ]);

  const normalCount = todayAttendances.filter((a) => a.type === "NORMAL").length;
  const absentCount = todayAttendances.filter((a) => a.type === "ABSENT").length;
  const tardyCount = todayAttendances.filter((a) => a.type === "TARDY").length;
  const checkInCount = todayAttendances.filter((a) => a.checkIn).length;

  const unreadCount = recentHandovers.filter(
    (h) => h.authorId !== session?.user?.id && !h.reads.some((r) => r.userId === session?.user?.id && r.confirmedAt != null)
  ).length;

  const attendanceRate = totalActive > 0 ? Math.round((normalCount / totalActive) * 100) : 0;
  const upcomingCount = upcomingMentorings.length;
  const lateOrAbsent = tardyCount + absentCount;
  const showMentorName = session?.user?.role === "DIRECTOR" || session?.user?.role === "SUPER_ADMIN";
  const dateLabel = today.toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Seoul",
  });

  // Merge today's check-ins + recent merits into a unified activity feed
  type ActivityRow = {
    time: Date;
    kind: "check-in" | "check-out" | "merit" | "demerit";
    who: string;
    detail: string;
  };
  const activity: ActivityRow[] = [];
  for (const a of todayAttendances) {
    if (a.checkIn) activity.push({ time: new Date(a.checkIn), kind: "check-in", who: a.student.name, detail: a.student.seat ? `좌석 ${a.student.seat}` : "입실" });
    if (a.checkOut) activity.push({ time: new Date(a.checkOut), kind: "check-out", who: a.student.name, detail: "퇴실" });
  }
  for (const m of recentMerits) {
    activity.push({
      time: new Date(m.createdAt),
      kind: m.type === "MERIT" ? "merit" : "demerit",
      who: m.student.name,
      detail: `${m.type === "MERIT" ? "+" : "-"}${m.points}점`,
    });
  }
  activity.sort((a, b) => b.time.getTime() - a.time.getTime());
  const activityRows = activity.slice(0, 10);

  const checkIns = todayAttendances
    .filter((a) => a.checkIn)
    .sort((a, b) => new Date(a.checkIn!).getTime() - new Date(b.checkIn!).getTime());

  // 예전 상단 알림 줄(미확인 인수인계·지각/결석·예정 면담)은 요약 카드(sub·링크)와 오른쪽 일정 섹션으로 합쳤다.
  const dashboardContent = (
    <div className="flex flex-col gap-x6">
      {/* 오늘 요약 — 각 카드는 해당 화면으로 이동 */}
      <StatCards cols={5}>
        <StatCard label="재원생" value={totalActive} unit="명" href="/students" />
        <StatCard
          label="오늘 출석"
          value={normalCount}
          unit={`/ ${totalActive}명`}
          sub={
            <span className={attendanceRate >= 80 ? "text-fg-positive" : "text-fg-critical"}>
              출석률 {attendanceRate}%
            </span>
          }
          href="/attendance"
        />
        <StatCard
          label="지각·결석"
          value={lateOrAbsent}
          unit="명"
          tone={lateOrAbsent > 0 ? "bad" : "gray"}
          sub={`지각 ${tardyCount} · 결석 ${absentCount}`}
          href="/attendance"
        />
        <StatCard label="예정 멘토링" value={upcomingCount} unit="건" href="/mentoring" />
        <StatCard
          label="미확인 인수인계"
          value={unreadCount}
          unit="건"
          tone={unreadCount > 0 ? "warn" : "gray"}
          sub="최근 7일 기준"
          href="/handover"
          className="col-span-2 lg:col-span-1"
        />
      </StatCards>

      {/* 순찰 시작 — 클릭 시 앱 내 순찰 모드 진입 (출퇴근 태깅 대체) */}
      <PatrolStartWidget active={activePatrolRound} />

      <div className="grid grid-cols-1 items-start gap-x4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* 왼쪽 — 주의가 필요한 것 · 과제 · 활동 */}
        <div className="flex min-w-0 flex-col gap-x4">
          {/* 유의 관찰 학생 — 수동 플래그 + 자동 판별 */}
          <AttentionWidget students={attentionStudents} />

          {/* §2.12 위젯: 과제 현황 */}
          <AllAssignmentsWidget rows={allAssignments} />

          {/* 실시간 활동 */}
          <Section title="실시간 활동" description={`오늘 ${activity.length}건`} flush>
            {activityRows.length === 0 ? (
              <EmptyState compact icon={Activity} title="오늘 활동이 아직 없어요" description="입실·퇴실과 상벌점 기록이 여기에 쌓여요" />
            ) : (
              <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                {activityRows.map((row, i) => (
                  <li key={i}>
                    <ListItem
                      leading={
                        <span className="w-18 shrink-0 t3-regular tabular-nums text-fg-neutral-subtle">
                          {formatTime(row.time)}
                        </span>
                      }
                      title={
                        <>
                          {row.who}
                          <span className="ml-x1_5 t4-regular text-fg-neutral-muted">
                            {row.kind === "check-in" && "입실"}
                            {row.kind === "check-out" && "퇴실"}
                            {row.kind === "merit" && "상점 획득"}
                            {row.kind === "demerit" && "벌점 부여"}
                          </span>
                        </>
                      }
                      trailing={<ActivityTag kind={row.kind} detail={row.detail} />}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* 오른쪽 — 다가오는 일정 · 원생 증감 · 오늘 기록 */}
        <div className="flex min-w-0 flex-col gap-x4">
          <Section
            title="예정된 멘토링"
            count={upcomingCount}
            actions={<SectionLink href="/mentoring">전체 보기</SectionLink>}
            flush
          >
            {upcomingCount === 0 ? (
              <EmptyState compact icon={MessageSquare} title="예정된 멘토링이 없어요" />
            ) : (
              <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                {upcomingMentorings.slice(0, 5).map((m) => (
                  <li key={m.id}>
                    <ListItem
                      href={`/mentoring/${m.id}`}
                      leading={<ScheduleTime at={m.scheduledAt} />}
                      title={m.student.name}
                      description={m.student.grade}
                      trailing={showMentorName ? m.mentor.name : undefined}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="예정된 원장 면담"
            count={upcomingConsultations.length}
            actions={<SectionLink href="/consultations">전체 보기</SectionLink>}
            flush
          >
            {upcomingConsultations.length === 0 ? (
              <EmptyState compact icon={CalendarDays} title="예정된 면담이 없어요" />
            ) : (
              <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                {upcomingConsultations.map((c) => (
                  <li key={c.id}>
                    <ListItem
                      href={`/consultations/${c.id}`}
                      leading={<ScheduleTime at={c.scheduledAt} />}
                      title={c.student?.name ?? c.prospectName ?? "—"}
                      description={c.student?.grade ?? c.prospectGrade ?? undefined}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* §2.12 위젯: 원생 증감 */}
          <EnrollmentDeltaWidget data={enrollmentDelta} year={year} month={month} canEdit={isFullAccess(session?.user?.role)} />

          {/* 오늘 입실 현황 */}
          {checkInCount > 0 && (
            <Section title="오늘 입실 현황" count={checkInCount} flush>
              <ul className="max-h-72 divide-y divide-stroke-neutral-muted overflow-y-auto border-t border-stroke-neutral-muted">
                {checkIns.map((a) => (
                  <li key={a.id}>
                    <ListItem
                      title={a.student.name}
                      trailing={
                        <>
                          {a.student.seat && <StatusBadge>{a.student.seat}</StatusBadge>}
                          <span className="tabular-nums">
                            {formatTime(a.checkIn!)}
                            {a.checkOut && ` → ${formatTime(a.checkOut)}`}
                          </span>
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* 최근 상벌점 */}
          {recentMerits.length > 0 && (
            <Section
              title="최근 상벌점"
              actions={<SectionLink href="/merit-demerit">전체 보기</SectionLink>}
              flush
            >
              <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                {recentMerits.map((m) => (
                  <li key={m.id}>
                    <ListItem
                      leading={
                        <StatusBadge tone={m.type === "MERIT" ? "ok" : "bad"}>
                          {m.type === "MERIT" ? "상점" : "벌점"}
                        </StatusBadge>
                      }
                      title={m.student.name}
                      trailing={
                        <>
                          <span className={`t4-bold tabular-nums ${m.type === "MERIT" ? "text-fg-positive" : "text-fg-critical"}`}>
                            {m.type === "MERIT" ? "+" : "-"}{m.points}
                          </span>
                          <span className="tabular-nums">{formatDate(m.date)}</span>
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <DashboardWrapper
      handovers={recentHandovers as Parameters<typeof DashboardWrapper>[0]["handovers"]}
      templates={templates}
      monthlyNotes={monthlyNotes as Parameters<typeof DashboardWrapper>[0]["monthlyNotes"]}
      students={students}
      staffList={staffList}
      currentUserId={session?.user?.id ?? ""}
      currentUserName={session?.user?.name ?? ""}
      userName={session?.user?.name ?? "관리자"}
      year={year}
      month={month}
      unreadCount={unreadCount}
      todos={todos as Parameters<typeof DashboardWrapper>[0]["todos"]}
      dateLabel={dateLabel}
    >
      {dashboardContent}
    </DashboardWrapper>
  );
}

/** 예정 일정 왼쪽 칸 — 시각(굵게) + 날짜 */
function ScheduleTime({ at }: { at: Date | null }) {
  return (
    <div className="w-20 shrink-0">
      <div className="t4-bold tabular-nums text-fg-neutral">{at ? formatTime(at) : "-"}</div>
      {at && <div className="t2-regular tabular-nums text-fg-neutral-subtle">{formatMonthDay(at)}</div>}
    </div>
  );
}

const ACTIVITY_TONE: Record<"check-in" | "check-out" | "merit" | "demerit", Tone> = {
  "check-in": "brand",
  "check-out": "gray",
  merit: "ok",
  demerit: "bad",
};

function ActivityTag({ kind, detail }: { kind: "check-in" | "check-out" | "merit" | "demerit"; detail: string }) {
  return <StatusBadge tone={ACTIVITY_TONE[kind]}>{detail}</StatusBadge>;
}
