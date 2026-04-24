"use client";

import Link from "next/link";
import { Paperclip, Download, MessageSquare } from "lucide-react";
import type { TaskFeedbackStatus, PerformanceTaskStatus } from "@/generated/prisma";
import type { UploadedFile } from "@/actions/online/task-submissions";
import { TaskFeedbackForm } from "@/components/online/task-feedback-form";

const FEEDBACK_LABEL: Record<TaskFeedbackStatus, string> = {
  COMMENT: "코멘트",
  NEEDS_REVISION: "수정 요청",
  APPROVED: "승인",
};

const FEEDBACK_COLORS: Record<TaskFeedbackStatus, string> = {
  COMMENT: "bg-slate-100 text-slate-700",
  NEEDS_REVISION: "bg-red-100 text-red-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
};

export type SubmissionVersion = {
  id: string;
  version: number;
  files: UploadedFile[];
  note: string | null;
  submittedAt: string; // ISO
  feedbacks: {
    id: string;
    authorName: string;
    content: string;
    status: TaskFeedbackStatus;
    createdAt: string;
  }[];
};

export function TaskSubmissionsThread({
  versions,
  taskStatus,
  canWriteFeedback,
  studentPortalUrl,
}: {
  versions: SubmissionVersion[]; // version 내림차순
  taskStatus: PerformanceTaskStatus;
  canWriteFeedback: boolean;
  studentPortalUrl?: string; // 학생 포털에서 렌더할 때는 undefined
}) {
  if (versions.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-line bg-canvas-2/50 p-6 text-center text-[12.5px] text-ink-5">
        아직 제출된 내용이 없습니다.
      </div>
    );
  }

  const latestVersion = versions[0]?.version ?? 1;
  const allowNewFeedback = taskStatus !== "DONE";

  return (
    <div className="space-y-3">
      {versions.map((sub) => {
        const isLatest = sub.version === latestVersion;
        return (
          <section
            key={sub.id}
            className="rounded-[12px] border border-line bg-panel overflow-hidden"
          >
            <header
              className={`flex items-center justify-between gap-2 px-4 py-2 border-b ${isLatest ? "bg-amber-50 border-amber-200" : "bg-canvas-2/50 border-line"}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${isLatest ? "bg-amber-200 text-amber-900" : "bg-slate-200 text-slate-700"}`}
                >
                  v{sub.version}
                  {isLatest && " · 최신"}
                </span>
                <span className="text-[11.5px] text-ink-4 tabular-nums">
                  {new Date(sub.submittedAt).toLocaleString("ko-KR")}
                </span>
              </div>
              {sub.feedbacks.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-ink-4">
                  <MessageSquare className="h-3 w-3" />
                  피드백 {sub.feedbacks.length}
                </span>
              )}
            </header>

            <div className="p-4 space-y-3">
              {/* 첨부 파일 */}
              <div className="space-y-1.5">
                <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide">
                  첨부 파일 ({sub.files.length})
                </h4>
                <ul className="space-y-1">
                  {sub.files.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded-[6px] bg-canvas-2 px-3 py-1.5 text-[12px]"
                    >
                      <Paperclip className="h-3.5 w-3.5 text-ink-4 shrink-0" />
                      <span className="flex-1 truncate text-ink">{f.name}</span>
                      <span className="shrink-0 text-[10.5px] text-ink-5 tabular-nums">
                        {(f.sizeBytes / 1024 / 1024).toFixed(1)}MB
                      </span>
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener"
                        download={f.name}
                        className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink"
                      >
                        <Download className="h-3 w-3" />
                        다운
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 학생 코멘트 */}
              {sub.note && (
                <div className="rounded-[8px] border border-line-2 bg-canvas px-3 py-2 text-[12px] text-ink whitespace-pre-wrap leading-relaxed">
                  <span className="text-[10.5px] font-semibold text-ink-4 block mb-0.5">
                    학생 코멘트
                  </span>
                  {sub.note}
                </div>
              )}

              {/* 피드백 */}
              {sub.feedbacks.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide">
                    피드백
                  </h4>
                  {sub.feedbacks.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-[8px] border border-line bg-canvas-2/40 p-3"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10.5px] font-medium ${FEEDBACK_COLORS[f.status]}`}
                        >
                          {FEEDBACK_LABEL[f.status]}
                        </span>
                        <span className="text-[10.5px] text-ink-5">
                          {f.authorName} · {new Date(f.createdAt).toLocaleString("ko-KR")}
                        </span>
                      </div>
                      <p className="text-[12px] text-ink whitespace-pre-wrap leading-relaxed">
                        {f.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* 피드백 작성 — 최신 버전 + 활성 상태일 때만 */}
              {isLatest && canWriteFeedback && allowNewFeedback && (
                <div id={`feedback-v${sub.version}`} className="scroll-mt-4">
                  {sub.feedbacks.length === 0 && (
                    <p className="text-[12px] text-ink-4 mb-2 flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                      <span className="font-medium">아직 피드백이 없습니다</span>
                      <span className="text-ink-5">— 이 제출물에 대한 피드백을 남겨주세요</span>
                    </p>
                  )}
                  <TaskFeedbackForm
                    submissionId={sub.id}
                    versionLabel={`v${sub.version} 제출물`}
                  />
                </div>
              )}

              {/* 학생 포털로의 가이드 — 학생용일 때 */}
              {isLatest && studentPortalUrl && taskStatus !== "DONE" && (
                <p className="text-[11px] text-ink-5">
                  💡 피드백을 받고 수정본을 올리면 새 버전(v{sub.version + 1})으로 저장됩니다.
                </p>
              )}
            </div>
          </section>
        );
      })}
      {studentPortalUrl && <Link href={studentPortalUrl} className="hidden" />}
    </div>
  );
}
