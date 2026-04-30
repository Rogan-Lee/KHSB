import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Paperclip, Download, FileCheck2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isOnlineStaff } from "@/lib/roles";
import type { UploadedFile } from "@/actions/online/task-submissions";

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
    select: { id: true, name: true, grade: true, isOnlineManaged: true },
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
          {student.name} — 포트폴리오
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          {student.grade} · 완료된 수행평가 {results.length}건
          {reportIncludedCount > 0 && ` · 학부모 보고서 포함 ${reportIncludedCount}건`}
        </p>
      </header>

      {results.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-line bg-canvas-2/50 p-8 text-center text-[13px] text-ink-5">
          최종 완료된 수행평가가 없습니다.
          <br />
          <span className="text-[11.5px]">컨설턴트가 피드백을 "승인" 처리하면 여기에 결과물이 쌓입니다.</span>
        </div>
      ) : (
        <div className="space-y-5">
          {subjects.map((subject) => (
            <section key={subject}>
              <h2 className="text-[13px] font-semibold text-ink-4 uppercase tracking-wide mb-2">
                {subject} · {bySubject[subject].length}건
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {bySubject[subject].map((r) => {
                  const files = Array.isArray(r.finalFiles)
                    ? (r.finalFiles as unknown as UploadedFile[])
                    : [];
                  return (
                    <Link
                      key={r.id}
                      href={`/online/students/${id}/tasks/${r.task.id}`}
                      className="block rounded-[12px] border border-line bg-panel p-4 hover:border-line-strong transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[13px] font-semibold text-ink">
                            {r.task.title}
                          </h3>
                          <p className="mt-0.5 text-[11.5px] text-ink-4">
                            {r.task.format && `${r.task.format} · `}
                            마감 {r.task.dueDate.toLocaleDateString("ko-KR")}
                            {r.finalizedAt && ` · 완료 ${r.finalizedAt.toLocaleDateString("ko-KR")}`}
                          </p>
                        </div>
                        {r.includeInReport && (
                          <span
                            title="학부모 보고서에 포함됨"
                            className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10.5px] font-medium"
                          >
                            <FileCheck2 className="h-3 w-3" />
                            보고서 포함
                          </span>
                        )}
                      </div>

                      {r.score && (
                        <p className="text-[12.5px] text-ink mb-1">
                          <span className="font-semibold">점수:</span> {r.score}
                        </p>
                      )}
                      {r.consultantSummary && (
                        <p className="text-[12px] text-ink-3 leading-relaxed whitespace-pre-wrap line-clamp-3 mb-2">
                          {r.consultantSummary}
                        </p>
                      )}
                      {files.length > 0 && (
                        <div className="flex items-center gap-1 text-[11px] text-ink-4">
                          <Paperclip className="h-3 w-3" />
                          {files.length}개 파일
                          <Download className="h-3 w-3 ml-auto" />
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
