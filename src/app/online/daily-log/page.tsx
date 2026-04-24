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

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          카톡 일일 보고
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          {todayIso} · 담당 학생별로 오늘의 카톡 대화 요약을 기록합니다.
        </p>
      </header>

      <DailyLogPanel
        rows={rows}
        logDate={todayIso}
        viewAll={viewAll}
        canToggleAll={isFullAccess(user?.role)}
      />
    </div>
  );
}
