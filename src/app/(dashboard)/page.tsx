export const revalidate = 30;

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatTime, todayKST } from "@/lib/utils";
import { IntroBand } from "@/components/ui/intro-band";
import { KpiTile, KpiStrip } from "@/components/ui/kpi-tile";
import { AlertCard, AlertStrip } from "@/components/ui/alert-card";
import { TagPill } from "@/components/ui/tag-pill";
import {
  Star,
  MessageSquare,
  CalendarDays,
  AlertTriangle,
  Bell,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { getRecentHandovers, getStaffList } from "@/actions/handover";
import { getChecklistTemplates } from "@/actions/checklist-templates";
import { getMonthlyNotes } from "@/actions/monthly-notes";
import { getTodos } from "@/actions/todos";
import { getAllAssignmentStatus, getEnrollmentDelta } from "@/actions/dashboard-widgets";
import { DashboardWrapper } from "@/components/dashboard/dashboard-wrapper";
import { AllAssignmentsWidget } from "@/components/dashboard/all-assignments-widget";
import { EnrollmentDeltaWidget } from "@/components/dashboard/enrollment-delta-widget";

export default async function DashboardPage() {
  const session = await auth();
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
  ]);

  const normalCount = todayAttendances.filter((a) => a.type === "NORMAL").length;
  const absentCount = todayAttendances.filter((a) => a.type === "ABSENT").length;
  const tardyCount = todayAttendances.filter((a) => a.type === "TARDY").length;
  const checkInCount = todayAttendances.filter((a) => a.checkIn).length;

  const unreadCount = recentHandovers.filter(
    (h) => h.authorId !== session?.user?.id && !h.reads.some((r) => r.userId === session?.user?.id)
  ).length;

  const attendanceRate = totalActive > 0 ? Math.round((normalCount / totalActive) * 100) : 0;
  const upcomingCount = upcomingMentorings.length;
  const dateLabel = today.toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Seoul",
  });

  const greeting = `안녕하세요, ${session?.user?.name ?? "관리자"}님`;

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

  const dashboardContent = (
    <div className="space-y-4">
      {/* Greeting band */}
      <IntroBand
        greeting={greeting}
        context={dateLabel}
        stats={[
          { label: "현재 재실", value: normalCount, tone: "ink" },
          { label: "예정 멘토링", value: upcomingCount, tone: "brand" },
          { label: "미읽음 인수인계", value: unreadCount, tone: unreadCount > 0 ? "warn" : "ink" },
        ]}
      />

      {/* KPI strip — 5 tiles */}
      <KpiStrip className="grid-cols-2 md:grid-cols-5">
        <KpiTile label="재원생" value={totalActive} unit="명" accent="var(--brand)" />
        <KpiTile
          label="오늘 출석"
          value={normalCount}
          unit={`/${totalActive}`}
          dir={attendanceRate >= 80 ? "up" : "down"}
          delta={`${attendanceRate}%`}
          accent="var(--ok)"
        />
        <KpiTile
          label="지각·결석"
          value={tardyCount + absentCount}
          unit="명"
          dir={tardyCount + absentCount > 0 ? "down" : null}
          delta={tardyCount + absentCount > 0 ? `+${tardyCount + absentCount}` : null}
          accent="var(--bad)"
        />
        <KpiTile label="예정 멘토링" value={upcomingCount} unit="건" accent="var(--info)" />
        <KpiTile label="인수인계" value={unreadCount} unit="건 미읽음" accent="var(--warn)" />
      </KpiStrip>

      {/* Alert strip */}
      {(unreadCount > 0 || tardyCount + absentCount > 0 || upcomingConsultations.length > 0) && (
        <AlertStrip cols={3} className="mb-0">
          {unreadCount > 0 ? (
            <AlertCard
              tone="info"
              icon={<FileText className="h-4 w-4" />}
              title={`인수인계 ${unreadCount}건 미읽음`}
              sub="최근 7일 인수인계를 확인하세요"
              cta="확인"
              href="/handover"
            />
          ) : <PlaceholderAlert />}
          {tardyCount + absentCount > 0 ? (
            <AlertCard
              tone="warn"
              icon={<AlertTriangle className="h-4 w-4" />}
              title={`오늘 지각·결석 ${tardyCount + absentCount}명`}
              sub={`지각 ${tardyCount} · 결석 ${absentCount}`}
              cta="출결 보기"
              href="/attendance"
            />
          ) : <PlaceholderAlert />}
          {upcomingConsultations.length > 0 ? (
            <AlertCard
              tone="bad"
              icon={<Bell className="h-4 w-4" />}
              title={`예정 면담 ${upcomingConsultations.length}건`}
              sub={upcomingConsultations[0]?.scheduledAt ? `가장 빠른 일정 · ${formatDate(upcomingConsultations[0].scheduledAt)}` : ""}
              cta="면담 보기"
              href="/consultations"
            />
          ) : <PlaceholderAlert />}
        </AlertStrip>
      )}

      {/* 1.5fr / 1fr layout — activity left, today stack right */}
      <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-4">
        {/* Activity feed */}
        <Card className="rounded-[12px] border-line shadow-[var(--shadow-xs)] overflow-hidden">
          <CardHeader className="flex flex-row items-center gap-2 py-[14px] px-[18px] border-b border-line-2">
            <CardTitle className="text-[13.5px] font-[650] tracking-[-0.015em] text-ink m-0">실시간 활동</CardTitle>
            <span className="text-[11.5px] text-ink-4">오늘 {activity.length}건</span>
          </CardHeader>
          <CardContent className="p-0">
            {activityRows.length === 0 ? (
              <p className="text-[12.5px] text-ink-4 py-6 text-center">오늘 활동 내역이 없습니다</p>
            ) : (
              <div>
                {activityRows.map((row, i) => (
                  <div
                    key={i}
                    className="grid items-center gap-[14px] px-[18px] py-[10px] border-b border-line-2 last:border-b-0 hover:bg-panel-2 text-[12.5px]"
                    style={{ gridTemplateColumns: "54px 1fr auto" }}
                  >
                    <span className="font-mono text-[11px] text-ink-4 tabular-nums">{formatTime(row.time)}</span>
                    <div>
                      <span className="font-semibold text-ink tracking-[-0.01em]">{row.who}</span>
                      <span className="text-ink-3 ml-1.5">
                        {row.kind === "check-in" && "입실"}
                        {row.kind === "check-out" && "퇴실"}
                        {row.kind === "merit" && "상점 획득"}
                        {row.kind === "demerit" && "벌점 부여"}
                      </span>
                    </div>
                    <ActivityTag kind={row.kind} detail={row.detail} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right stack */}
        <div className="flex flex-col gap-4">
          {/* Today mentoring */}
          <Card className="rounded-[12px] border-line shadow-[var(--shadow-xs)] overflow-hidden">
            <CardHeader className="flex flex-row items-center gap-2 py-[14px] px-[18px] border-b border-line-2">
              <MessageSquare className="h-4 w-4 text-ink-4" />
              <CardTitle className="text-[13.5px] font-[650] tracking-[-0.015em] text-ink m-0">예정된 멘토링</CardTitle>
              <span className="ml-auto text-[11.5px] text-ink-4 font-mono tabular-nums">{upcomingCount}건</span>
            </CardHeader>
            <CardContent className="p-0">
              {upcomingCount === 0 ? (
                <p className="text-[12.5px] text-ink-4 py-5 text-center">예정된 멘토링이 없습니다</p>
              ) : (
                <div>
                  {upcomingMentorings.slice(0, 5).map((m) => (
                    <Link key={m.id} href={`/mentoring/${m.id}`}>
                      <div className="flex items-center gap-2.5 px-[18px] py-[9px] border-b border-line-2 last:border-b-0 hover:bg-panel-2 text-[12.5px]">
                        <span className="w-[38px] font-mono text-[10.5px] text-ink-4 tabular-nums">
                          {formatTime(m.scheduledAt)}
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                        <span className="font-semibold text-ink tracking-[-0.01em]">{m.student.name}</span>
                        <span className="text-[11px] text-ink-4">{m.student.grade}</span>
                        {(session?.user?.role === "DIRECTOR" || session?.user?.role === "ADMIN") && (
                          <span className="ml-auto text-[11px] text-ink-4">{m.mentor.name}</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming consultations */}
          <Card className="rounded-[12px] border-line shadow-[var(--shadow-xs)] overflow-hidden">
            <CardHeader className="flex flex-row items-center gap-2 py-[14px] px-[18px] border-b border-line-2">
              <CalendarDays className="h-4 w-4 text-ink-4" />
              <CardTitle className="text-[13.5px] font-[650] tracking-[-0.015em] text-ink m-0">예정된 원장 면담</CardTitle>
              <span className="ml-auto text-[11.5px] text-ink-4 font-mono tabular-nums">{upcomingConsultations.length}건</span>
            </CardHeader>
            <CardContent className="p-0">
              {upcomingConsultations.length === 0 ? (
                <p className="text-[12.5px] text-ink-4 py-5 text-center">예정된 면담이 없습니다</p>
              ) : (
                <div>
                  {upcomingConsultations.map((c) => (
                    <div key={c.id} className="flex items-center gap-2.5 px-[18px] py-[9px] border-b border-line-2 last:border-b-0 text-[12.5px]">
                      <span className="w-[38px] font-mono text-[10.5px] text-ink-4 tabular-nums">
                        {c.scheduledAt ? formatTime(c.scheduledAt) : "-"}
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-info" />
                      <span className="font-semibold text-ink tracking-[-0.01em]">
                        {c.student?.name ?? c.prospectName ?? "—"}
                      </span>
                      <span className="text-[11px] text-ink-4">{c.student?.grade ?? c.prospectGrade}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* §2.12 위젯: 과제 현황 + 원생 증감 */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
        <AllAssignmentsWidget rows={allAssignments} />
        <EnrollmentDeltaWidget data={enrollmentDelta} year={year} month={month} />
      </div>

      {/* 오늘 입실 (유지, 하단 전체폭) */}
      {checkInCount > 0 && (
        <Card className="rounded-[12px] border-line shadow-[var(--shadow-xs)] overflow-hidden">
          <CardHeader className="flex flex-row items-center gap-2 py-[14px] px-[18px] border-b border-line-2">
            <CardTitle className="text-[13.5px] font-[650] tracking-[-0.015em] text-ink m-0">오늘 입실 현황</CardTitle>
            <span className="ml-auto text-[11.5px] text-ink-4 font-mono tabular-nums">{checkInCount}명</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-56 overflow-y-auto">
              {todayAttendances
                .filter((a) => a.checkIn)
                .sort((a, b) => new Date(a.checkIn!).getTime() - new Date(b.checkIn!).getTime())
                .map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-[18px] py-[7px] border-b border-line-2 last:border-b-0 text-[12.5px]">
                    <span className="font-semibold text-ink tracking-[-0.01em]">{a.student.name}</span>
                    <div className="flex items-center gap-2 text-ink-4 font-mono tabular-nums">
                      {a.student.seat && (
                        <span className="text-[10.5px] bg-canvas-2 text-ink-3 px-1.5 py-0.5 rounded-[4px] font-sans">{a.student.seat}</span>
                      )}
                      <span>{formatTime(a.checkIn!)}</span>
                      {a.checkOut && <span>→ {formatTime(a.checkOut)}</span>}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent merits (유지, compact) */}
      {recentMerits.length > 0 && (
        <Card className="rounded-[12px] border-line shadow-[var(--shadow-xs)] overflow-hidden">
          <CardHeader className="flex flex-row items-center gap-2 py-[14px] px-[18px] border-b border-line-2">
            <Star className="h-4 w-4 text-ink-4" />
            <CardTitle className="text-[13.5px] font-[650] tracking-[-0.015em] text-ink m-0">최근 상벌점</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentMerits.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-[18px] py-[9px] border-b border-line-2 last:border-b-0 text-[12.5px]">
                <div className="flex items-center gap-2.5">
                  <TagPill variant={m.type === "MERIT" ? "ok" : "bad"} dot>
                    {m.type === "MERIT" ? "상점" : "벌점"}
                  </TagPill>
                  <span className="font-semibold text-ink tracking-[-0.01em]">{m.student.name}</span>
                </div>
                <div className="flex items-center gap-2 text-ink-4 font-mono tabular-nums">
                  <span className={m.type === "MERIT" ? "text-ok font-semibold" : "text-bad font-semibold"}>
                    {m.type === "MERIT" ? "+" : "-"}{m.points}
                  </span>
                  <span className="text-[10.5px]">{formatDate(m.date)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
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
      userName={session?.user?.name ?? ""}
      year={year}
      month={month}
      unreadCount={unreadCount}
      todos={todos as Parameters<typeof DashboardWrapper>[0]["todos"]}
    >
      {dashboardContent}
    </DashboardWrapper>
  );
}

function PlaceholderAlert() {
  return (
    <div className="flex items-center gap-3 px-[14px] py-3 bg-panel-2 border border-line border-dashed rounded-[10px] text-[11.5px] text-ink-4">
      <span className="grid place-items-center w-[30px] h-[30px] rounded-[8px] bg-canvas-2 text-ink-5">
        ·
      </span>
      <span>이상 없음</span>
    </div>
  );
}

function ActivityTag({ kind, detail }: { kind: "check-in" | "check-out" | "merit" | "demerit"; detail: string }) {
  if (kind === "merit") return <TagPill variant="ok">{detail}</TagPill>;
  if (kind === "demerit") return <TagPill variant="bad">{detail}</TagPill>;
  if (kind === "check-in") return <TagPill variant="brand">{detail}</TagPill>;
  return <TagPill variant="neutral">{detail}</TagPill>;
}
