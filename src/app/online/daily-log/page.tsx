import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import {
  isOnlineStaff,
  isManagerMentor,
  isFullAccess,
} from "@/lib/roles";
import { todayKST } from "@/lib/utils";
import { DailyLogPanel, type DailyLogRow } from "@/components/online/daily-log-panel";
import { PageHeader } from "@/components/backoffice/ui";

export default async function DailyLogBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const user = await getUser();
  if (!isOnlineStaff(user?.role)) redirect("/");
  if (!isManagerMentor(user?.role) && !isFullAccess(user?.role)) {
    redirect("/online");
  }

  const { all } = await searchParams;
  const viewAll = all === "1" && isFullAccess(user?.role);

  const today = todayKST();
  const todayIso = today.toISOString().slice(0, 10);

  const students = await prisma.student.findMany({
    where: {
      isOnlineManaged: true,
      status: "ACTIVE",
      ...(viewAll ? {} : { assignedMentorId: user!.id }),
    },
    orderBy: { name: "asc" },
    include: {
      dailyKakaoLogs: {
        where: { logDate: today },
        take: 1,
        include: { author: { select: { name: true } } },
      },
    },
  });

  const rows: DailyLogRow[] = students.map((s) => {
    const log = s.dailyKakaoLogs[0];
    return {
      studentId: s.id,
      studentName: s.name,
      grade: s.grade,
      school: s.school,
      log: log
        ? {
            id: log.id,
            summary: log.summary,
            tags: log.tags,
            isParentVisible: log.isParentVisible,
            authorName: log.author.name,
          }
        : null,
    };
  });

  const dateLabel = today.toLocaleDateString("ko-KR", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div>
      <PageHeader
        title="카톡 일일 보고"
        description={
          <>
            <span className="tabular-nums">{dateLabel}</span> ·{" "}
            {viewAll ? "전체 학생" : "담당 학생"}별로 오늘 카톡 대화 요약을 기록해요
          </>
        }
      />

      <DailyLogPanel
        rows={rows}
        logDate={todayIso}
        viewAll={viewAll}
        canToggleAll={isFullAccess(user?.role)}
      />
    </div>
  );
}
