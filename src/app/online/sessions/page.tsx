import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, StatCard, StatCards } from "@/components/backoffice/ui";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isOnlineStaff, isFullAccess } from "@/lib/roles";
import {
  isGoogleCalendarConfigured,
  isOAuthAppConfigured,
} from "@/lib/google-calendar";
import {
  MentoringSessionsPanel,
  type MentoringPanelStudentRow,
} from "@/components/online/mentoring-sessions-panel";

export default async function MentoringSessionsPage() {
  const user = await getUser();
  if (!isOnlineStaff(user?.role)) redirect("/");
  const canConnectCalendar = isFullAccess(user?.role);

  const [calendarConnected, oauthAppReady] = await Promise.all([
    isGoogleCalendarConfigured(),
    Promise.resolve(isOAuthAppConfigured()),
  ]);

  const students = await prisma.student.findMany({
    where: { isOnlineManaged: true, status: "ACTIVE" },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      grade: true,
      school: true,
      assignedMentor: { select: { name: true } },
      mentoringSessions: {
        orderBy: { scheduledAt: "desc" },
        take: 30,
        include: {
          host: { select: { name: true } },
          photos: { orderBy: { uploadedAt: "asc" } },
        },
      },
    },
  });

  const rows: MentoringPanelStudentRow[] = students.map((s) => ({
    studentId: s.id,
    studentName: s.name,
    grade: s.grade,
    school: s.school,
    assignedMentorName: s.assignedMentor?.name ?? null,
    sessions: s.mentoringSessions.map((ms) => ({
      id: ms.id,
      title: ms.title,
      status: ms.status,
      scheduledAt: ms.scheduledAt.toISOString(),
      durationMinutes: ms.durationMinutes,
      meetUrl: ms.meetUrl,
      calendarHtmlLink: ms.calendarHtmlLink,
      notes: ms.notes,
      summary: ms.summary,
      hostName: ms.host.name,
      photos: ms.photos,
    })),
  }));

  // 전체 통계 (헤더 표시용)
  const totalUpcoming = rows.reduce(
    (sum, r) =>
      sum +
      r.sessions.filter(
        (s) =>
          (s.status === "SCHEDULED" || s.status === "IN_PROGRESS") &&
          new Date(s.scheduledAt).getTime() > Date.now()
      ).length,
    0
  );
  const totalCompleted = rows.reduce(
    (sum, r) => sum + r.sessions.filter((s) => s.status === "COMPLETED").length,
    0
  );

  const totalSessions = rows.reduce((sum, r) => sum + r.sessions.length, 0);

  return (
    <div>
      <PageHeader
        title="화상 1:1 세션"
        description="학생을 고르면 예약 · 노트 작성 · AI 요약 적재까지 한 화면에서 처리해요"
      />

      <div className="flex flex-col gap-x6">
        {!calendarConnected && (
          <section
            role="alert"
            className="flex flex-col gap-x3 rounded-r3 bg-bg-warning-weak px-x5 py-x4 sm:flex-row sm:items-start"
          >
            <AlertTriangle className="size-5 shrink-0 text-fg-warning" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="t5-bold text-fg-neutral">학원 Google Calendar가 연동되지 않았어요</h2>
              <p className="mt-x1 t4-regular text-fg-neutral-muted">
                세션을 예약해도 Meet 링크와 학부모 초대 메일이 자동으로 나가지 않아요.
                학원 공용 Google 계정으로 한 번만 연동하면 모든 세션에서 자동으로 동작해요.
              </p>
              {!oauthAppReady && (
                <p className="mt-x2 t3-medium text-fg-critical">
                  환경변수 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI 가 누락됐습니다. 먼저 Vercel 설정을 확인하세요.
                </p>
              )}
              <div className="mt-x3 flex flex-wrap items-center gap-x2">
                {canConnectCalendar && oauthAppReady ? (
                  <Button asChild size="sm">
                    <a href="/api/google-calendar/auth">
                      Google 계정 연동하기
                      <ExternalLink />
                    </a>
                  </Button>
                ) : !canConnectCalendar ? (
                  <span className="t3-regular text-fg-neutral-muted">
                    원장(DIRECTOR) 또는 SUPER_ADMIN 만 연동할 수 있습니다.
                  </span>
                ) : null}
                <Button asChild variant="outline" size="sm">
                  <Link href="/calendar">Calendar 설정 페이지로 이동</Link>
                </Button>
              </div>
            </div>
          </section>
        )}

        <StatCards cols={3}>
          <StatCard label="예정 세션" value={totalUpcoming} unit="건" />
          <StatCard label="완료 세션" value={totalCompleted} unit="건" sub="학생별 최근 30건 기준" />
          <StatCard label="대상 학생" value={rows.length} unit="명" sub={`전체 세션 ${totalSessions}건`} />
        </StatCards>

        <MentoringSessionsPanel rows={rows} />
      </div>
    </div>
  );
}
