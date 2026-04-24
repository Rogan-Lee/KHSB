import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import {
  isOnlineStaff,
  isManagerMentor,
  isFullAccess,
} from "@/lib/roles";
import { todayKST } from "@/lib/utils";
import { DailyLogRow } from "@/components/online/daily-log-row";

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
      },
    },
  });

  // 미기록 학생을 상단에 배치
  const sorted = [...students].sort((a, b) => {
    const aHas = a.dailyKakaoLogs.length > 0 ? 1 : 0;
    const bHas = b.dailyKakaoLogs.length > 0 ? 1 : 0;
    if (aHas !== bHas) return aHas - bHas;
    return a.name.localeCompare(b.name, "ko");
  });

  const unrecorded = students.filter((s) => s.dailyKakaoLogs.length === 0).length;

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
            카톡 일일 보고
          </h1>
          <p className="mt-1 text-[13px] text-ink-4">
            {todayIso} · {students.length}명 담당
            {unrecorded > 0 && (
              <span className="ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-800">
                미기록 {unrecorded}
              </span>
            )}
          </p>
        </div>
        {isFullAccess(user?.role) && (
          <div className="flex items-center gap-2 text-[12px]">
            <Link
              href="/online/daily-log"
              className={`rounded-full px-3 py-1 font-medium ${
                !viewAll ? "bg-ink text-white" : "bg-panel border border-line text-ink-3"
              }`}
            >
              내 학생만
            </Link>
            <Link
              href="/online/daily-log?all=1"
              className={`rounded-full px-3 py-1 font-medium ${
                viewAll ? "bg-ink text-white" : "bg-panel border border-line text-ink-3"
              }`}
            >
              전체
            </Link>
          </div>
        )}
      </header>

      {students.length === 0 ? (
        <div className="rounded-[12px] border border-line bg-panel p-8 text-center text-[13px] text-ink-4">
          담당 온라인 학생이 없습니다.
        </div>
      ) : (
        <section className="space-y-2">
          {sorted.map((s) => {
            const existing = s.dailyKakaoLogs[0];
            return (
              <DailyLogRow
                key={s.id}
                studentId={s.id}
                studentName={s.name}
                studentGrade={s.grade}
                logDate={todayIso}
                initialSummary={existing?.summary ?? ""}
                initialTags={existing?.tags ?? []}
                initialIsParentVisible={existing?.isParentVisible ?? true}
                hasExistingLog={!!existing}
              />
            );
          })}
        </section>
      )}

      <p className="text-[11px] text-ink-5 leading-relaxed">
        💡 입력 후 1초 뒤 자동 저장됩니다. 블러(focus 이탈) 시에도 즉시 저장.
      </p>
    </div>
  );
}
