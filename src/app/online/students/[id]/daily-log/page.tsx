import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isOnlineStaff, canViewKakaoRaw } from "@/lib/roles";

export default async function StudentDailyLogHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  if (!isOnlineStaff(user?.role)) redirect("/");

  const student = await prisma.student.findUnique({
    where: { id },
    select: { id: true, name: true, grade: true, isOnlineManaged: true },
  });
  if (!student || !student.isOnlineManaged) notFound();

  const logs = await prisma.dailyKakaoLog.findMany({
    where: { studentId: id },
    orderBy: { logDate: "desc" },
    take: 60,
    include: { author: { select: { name: true } } },
  });

  const canSeeRaw = canViewKakaoRaw(user?.role);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/online/students/${id}`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-4 hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          학생 상세
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          {student.name} — 카톡 일일 보고
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          {student.grade} · 최근 {logs.length}건
          {!canSeeRaw && (
            <span className="ml-2 text-[11px] text-ink-5">
              (컨설턴트는 내부 메모 · 원문 접근 제한)
            </span>
          )}
        </p>
      </header>

      {logs.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-line bg-canvas-2/50 p-8 text-center text-[13px] text-ink-5">
          작성된 일일 보고가 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => {
            const hidden = !canSeeRaw && !log.isParentVisible;
            return (
              <li
                key={log.id}
                className="rounded-[12px] border border-line bg-panel p-3"
              >
                <header className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-semibold text-ink tabular-nums">
                      {log.logDate.toLocaleDateString("ko-KR")}
                    </span>
                    <span className="text-[11px] text-ink-5">
                      {log.author.name}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                      log.isParentVisible
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {log.isParentVisible ? (
                      <>
                        <Eye className="h-3 w-3" /> 학부모 공개
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3" /> 내부만
                      </>
                    )}
                  </span>
                </header>
                {hidden ? (
                  <p className="text-[12.5px] text-ink-5 italic">
                    내부 메모 — 권한 상 가려집니다.
                  </p>
                ) : (
                  <p className="text-[12.5px] text-ink whitespace-pre-wrap leading-relaxed">
                    {log.summary}
                  </p>
                )}
                {log.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {log.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-block rounded-full bg-canvas-2 px-2 py-0.5 text-[10.5px] text-ink-4"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
