import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isOnlineStaff } from "@/lib/roles";
import {
  MentoringSessionsPanel,
  type MentoringPanelStudentRow,
} from "@/components/online/mentoring-sessions-panel";

export default async function MentoringSessionsPage() {
  const user = await getUser();
  if (!isOnlineStaff(user?.role)) redirect("/");

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

      <MentoringSessionsPanel rows={rows} />
    </div>
  );
}
