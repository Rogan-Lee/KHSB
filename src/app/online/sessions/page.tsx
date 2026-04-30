import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ExternalLink } from "lucide-react";
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
        include: { host: { select: { name: true } } },
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

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          화상 1:1 세션
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          예정 <b className="text-ink-2">{totalUpcoming}</b>건 · 완료{" "}
          <b className="text-ink-2">{totalCompleted}</b>건 · 좌측에서 학생 선택 → 우측에서 예약·노트 작성·요약 적재까지 인라인 처리
        </p>
      </header>

      {!calendarConnected && (
        <section className="rounded-[12px] border-2 border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="text-[13.5px] font-semibold text-amber-900">
              학원 Google Calendar가 연동되지 않았습니다
            </h2>
            <p className="mt-1 text-[12px] text-amber-800 leading-relaxed">
              세션을 예약해도 Meet 링크와 학부모 invite 메일이 자동 발송되지 않습니다.
              학원 공용 Google 계정으로 1회 연동하면 모든 세션에서 자동 동작합니다.
            </p>
            {!oauthAppReady && (
              <p className="mt-1 text-[11.5px] text-red-700">
                ⚠️ 환경변수 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI 가 누락됐습니다. 먼저 Vercel 설정을 확인하세요.
              </p>
            )}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {canConnectCalendar && oauthAppReady ? (
                <a
                  href="/api/google-calendar/auth"
                  className="inline-flex items-center gap-1.5 rounded-[8px] bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-[12.5px] font-semibold"
                >
                  Google 계정 연동하기
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : !canConnectCalendar ? (
                <span className="text-[11.5px] text-amber-700">
                  원장(DIRECTOR) 또는 SUPER_ADMIN 만 연동할 수 있습니다.
                </span>
              ) : null}
              <Link
                href="/calendar"
                className="inline-flex items-center gap-1 rounded-[8px] border border-amber-300 bg-white hover:bg-amber-100 px-3 py-1.5 text-[12.5px] text-amber-900"
              >
                Calendar 설정 페이지로 이동
              </Link>
            </div>
          </div>
        </section>
      )}

      <MentoringSessionsPanel rows={rows} />
    </div>
  );
}
