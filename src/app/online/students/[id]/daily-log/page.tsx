import { notFound, redirect } from "next/navigation";
import { Eye, EyeOff, MessageSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isOnlineStaff, canViewKakaoRaw } from "@/lib/roles";
import { EmptyState, Notice, Section, StatusBadge } from "@/components/backoffice/ui";
import { StudentDetailHeader } from "../_components/student-detail-header";

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
    select: { id: true, name: true, grade: true, status: true, isOnlineManaged: true },
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
    <div>
      <StudentDetailHeader
        student={student}
        current="daily-log"
        description={`${student.grade} · 최근 ${logs.length}건`}
      />

      <div className="flex flex-col gap-x4">
        {!canSeeRaw && (
          <Notice tone="gray" icon={EyeOff}>
            컨설턴트는 내부 메모와 원문을 볼 수 없어요.
          </Notice>
        )}

        <Section title="카톡 일일 보고" count={logs.length} flush>
          {logs.length === 0 ? (
            <EmptyState compact icon={MessageSquare} title="아직 작성된 일일 보고가 없어요" />
          ) : (
            <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
              {logs.map((log) => {
                const hidden = !canSeeRaw && !log.isParentVisible;
                return (
                  <li key={log.id} className="flex flex-col gap-x2 px-x5 py-x4">
                    <div className="flex items-center justify-between gap-x3">
                      <div className="flex min-w-0 items-baseline gap-x2">
                        <span className="t4-bold tabular-nums text-fg-neutral">
                          {log.logDate.toLocaleDateString("ko-KR")}
                        </span>
                        <span className="truncate t3-regular text-fg-neutral-subtle">{log.author.name}</span>
                      </div>
                      {log.isParentVisible ? (
                        <StatusBadge tone="ok" className="shrink-0">
                          <Eye aria-hidden />
                          학부모 공개
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="gray" className="shrink-0">
                          <EyeOff aria-hidden />
                          내부만
                        </StatusBadge>
                      )}
                    </div>
                    {hidden ? (
                      <p className="t4-regular text-fg-placeholder">내부 메모 — 권한 상 가려집니다.</p>
                    ) : (
                      <p className="whitespace-pre-wrap t4-regular text-fg-neutral">{log.summary}</p>
                    )}
                    {log.tags.length > 0 && (
                      <div className="flex flex-wrap gap-x1">
                        {log.tags.map((t) => (
                          <StatusBadge key={t} tone="gray">
                            #{t}
                          </StatusBadge>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
