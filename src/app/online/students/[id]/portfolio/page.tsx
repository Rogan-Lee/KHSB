import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, FolderOpen, Paperclip } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isOnlineStaff } from "@/lib/roles";
import type { UploadedFile } from "@/actions/online/task-submissions";
import { EmptyState, Section, StatusBadge } from "@/components/backoffice/ui";
import { StudentDetailHeader } from "../_components/student-detail-header";

export default async function StudentPortfolioPage({
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

  const results = await prisma.taskResult.findMany({
    where: { studentId: id },
    orderBy: { finalizedAt: "desc" },
    include: {
      task: {
        select: {
          id: true,
          subject: true,
          title: true,
          dueDate: true,
          scoreWeight: true,
          format: true,
        },
      },
    },
  });

  // 과목별 그룹핑
  const bySubject: Record<string, typeof results> = {};
  for (const r of results) {
    (bySubject[r.task.subject] ??= []).push(r);
  }
  const subjects = Object.keys(bySubject).sort();

  const reportIncludedCount = results.filter((r) => r.includeInReport).length;

  return (
    <div>
      <StudentDetailHeader
        student={student}
        current="portfolio"
        description={
          <>
            {student.grade} · 완료된 수행평가 {results.length}건
            {reportIncludedCount > 0 && ` · 학부모 보고서 포함 ${reportIncludedCount}건`}
          </>
        }
      />

      {results.length === 0 ? (
        <Section>
          <EmptyState
            icon={FolderOpen}
            title="아직 최종 완료된 수행평가가 없어요"
            description="컨설턴트가 피드백을 '승인' 처리하면 여기에 결과물이 쌓여요."
          />
        </Section>
      ) : (
        <div className="flex flex-col gap-x6">
          {subjects.map((subject) => (
            <Section
              key={subject}
              title={subject}
              count={bySubject[subject].length}
              flush
              className="overflow-hidden"
            >
              <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                {bySubject[subject].map((r) => {
                  const files = Array.isArray(r.finalFiles)
                    ? (r.finalFiles as unknown as UploadedFile[])
                    : [];
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/online/students/${id}/tasks/${r.task.id}`}
                        className="flex items-start gap-x3 px-x5 py-x4 transition-colors hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="t4-medium text-fg-neutral">{r.task.title}</p>
                          <p className="mt-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">
                            {r.task.format && `${r.task.format} · `}
                            마감 {r.task.dueDate.toLocaleDateString("ko-KR")}
                            {r.finalizedAt && ` · 완료 ${r.finalizedAt.toLocaleDateString("ko-KR")}`}
                          </p>
                          {r.score && (
                            <p className="mt-x2 t4-regular text-fg-neutral">
                              <span className="t4-bold">점수</span> {r.score}
                            </p>
                          )}
                          {r.consultantSummary && (
                            <p className="mt-x1 line-clamp-2 whitespace-pre-wrap t3-regular text-fg-neutral-muted">
                              {r.consultantSummary}
                            </p>
                          )}
                        </div>
                        {(r.includeInReport || files.length > 0) && (
                          <div className="flex shrink-0 flex-col items-end gap-x1_5">
                            {r.includeInReport && (
                              <span title="학부모 보고서에 포함됨">
                                <StatusBadge tone="ok">보고서 포함</StatusBadge>
                              </span>
                            )}
                            {files.length > 0 && (
                              <span className="inline-flex items-center gap-x1 t3-regular tabular-nums text-fg-neutral-subtle">
                                <Paperclip className="size-3.5" aria-hidden />
                                {files.length}개 파일
                              </span>
                            )}
                          </div>
                        )}
                        <ChevronRight className="mt-x0_5 size-4 shrink-0 text-fg-placeholder" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
