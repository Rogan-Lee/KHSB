"use client";

import Link from "next/link";
import {
  Download,
  MessageSquare,
  FileText,
  ImageIcon,
  Inbox,
} from "lucide-react";
import type { TaskFeedbackStatus, PerformanceTaskStatus } from "@/generated/prisma";
import type { UploadedFile } from "@/actions/online/task-submissions";
import { TaskFeedbackForm } from "@/components/online/task-feedback-form";
import { Avatar, Badge, EmptyState, IconTile, PRESS, Section } from "@/components/portal/ui";
import {
  EmptyState as BoEmptyState,
  Section as BoSection,
  StatusBadge,
  type Tone as BoTone,
} from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FEEDBACK_STATUS } from "@/components/portal/status";

const FEEDBACK_LABEL: Record<TaskFeedbackStatus, string> = {
  COMMENT: "코멘트",
  NEEDS_REVISION: "수정 요청",
  APPROVED: "승인",
};

const FEEDBACK_TONE: Record<TaskFeedbackStatus, BoTone> = {
  COMMENT: "gray",
  NEEDS_REVISION: "bad",
  APPROVED: "ok",
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
    files?: UploadedFile[];
  }[];
};

export function TaskSubmissionsThread({
  versions,
  taskStatus,
  canWriteFeedback,
  studentPortalUrl,
  variant = "default",
}: {
  versions: SubmissionVersion[]; // version 내림차순
  taskStatus: PerformanceTaskStatus;
  canWriteFeedback: boolean;
  studentPortalUrl?: string; // 학생 포털에서 렌더할 때는 undefined
  /** "portal" = 학생 포털(Toss 스타일). 직원 화면은 default 유지 */
  variant?: "default" | "portal";
}) {
  if (variant === "portal") {
    return (
      <PortalThread
        versions={versions}
        taskStatus={taskStatus}
        canWriteFeedback={canWriteFeedback}
        studentPortalUrl={studentPortalUrl}
      />
    );
  }

  if (versions.length === 0) {
    return (
      <BoSection>
        <BoEmptyState compact icon={Inbox} title="아직 제출된 내용이 없어요" />
      </BoSection>
    );
  }

  const latestVersion = versions[0]?.version ?? 1;
  const allowNewFeedback = taskStatus !== "DONE";

  return (
    <div className="flex flex-col gap-x4">
      {versions.map((sub) => {
        const isLatest = sub.version === latestVersion;
        return (
          <BoSection
            key={sub.id}
            flush
            title={
              <>
                v{sub.version} 제출
                {isLatest && <StatusBadge tone="brand">최신</StatusBadge>}
              </>
            }
            description={
              <span className="tabular-nums">{new Date(sub.submittedAt).toLocaleString("ko-KR")}</span>
            }
            actions={
              sub.feedbacks.length > 0 ? (
                <span className="inline-flex items-center gap-x1 t3-medium tabular-nums text-fg-neutral-subtle">
                  <MessageSquare className="size-4" aria-hidden />
                  피드백 {sub.feedbacks.length}
                </span>
              ) : undefined
            }
          >
            <div className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
              {/* 첨부 파일 */}
              <div className="px-x5 py-x4">
                <h3 className="t4-bold text-fg-neutral">
                  첨부 파일 <span className="tabular-nums text-fg-neutral-subtle">{sub.files.length}</span>
                </h3>
                {sub.files.length > 0 ? (
                  <ul className="mt-x1">
                    {sub.files.map((f, i) => (
                      <StaffFileRow key={i} file={f} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-x1_5 t3-regular text-fg-neutral-subtle">첨부한 파일이 없어요</p>
                )}
              </div>

              {/* 학생 코멘트 */}
              {sub.note && (
                <div className="px-x5 py-x4">
                  <h3 className="t4-bold text-fg-neutral">학생 코멘트</h3>
                  <p className="mt-x2 whitespace-pre-wrap break-words rounded-r2 bg-bg-layer-fill px-x4 py-x3 t4-regular text-fg-neutral">
                    {sub.note}
                  </p>
                </div>
              )}

              {/* 피드백 */}
              {sub.feedbacks.length > 0 && (
                <div className="px-x5 py-x4">
                  <h3 className="t4-bold text-fg-neutral">
                    피드백 <span className="tabular-nums text-fg-neutral-subtle">{sub.feedbacks.length}</span>
                  </h3>
                  <ul className="mt-x1 divide-y divide-stroke-neutral-muted">
                    {sub.feedbacks.map((f) => (
                      <li key={f.id} className="py-x3 last:pb-0">
                        <div className="flex flex-wrap items-center gap-x-x2 gap-y-x1">
                          <span className="t4-bold text-fg-neutral">{f.authorName}</span>
                          <StatusBadge tone={FEEDBACK_TONE[f.status]}>{FEEDBACK_LABEL[f.status]}</StatusBadge>
                          <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                            {new Date(f.createdAt).toLocaleString("ko-KR")}
                          </span>
                        </div>
                        <p className="mt-x1_5 whitespace-pre-wrap break-words t4-regular text-fg-neutral">
                          {f.content}
                        </p>
                        {f.files && f.files.length > 0 && (
                          <ul className="mt-x1">
                            {f.files.map((af, i) => (
                              <StaffFileRow key={i} file={af} />
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 피드백 작성 — 최신 버전 + 활성 상태일 때만 */}
              {isLatest && canWriteFeedback && allowNewFeedback && (
                <div id={`feedback-v${sub.version}`} className="scroll-mt-4 px-x5 py-x5">
                  {sub.feedbacks.length === 0 && (
                    <p className="mb-x4 flex flex-wrap items-center gap-x-x1_5 t3-regular text-fg-neutral-subtle">
                      <span aria-hidden className="size-x2 shrink-0 rounded-full bg-bg-warning-solid" />
                      <span className="t3-bold text-fg-neutral">아직 피드백이 없어요</span>
                      <span>— 이 제출물에 피드백을 남겨 주세요</span>
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
                <p className="px-x5 py-x3 t3-regular text-fg-neutral-subtle">
                  피드백을 받고 수정본을 올리면 새 버전(v{sub.version + 1})으로 저장돼요.
                </p>
              )}
            </div>
          </BoSection>
        );
      })}
      {studentPortalUrl && <Link href={studentPortalUrl} className="hidden" />}
    </div>
  );
}

/** 직원 화면 첨부 파일 행 — 파일 아이콘 · 이름 · 크기 · 다운로드 */
function StaffFileRow({ file }: { file: UploadedFile }) {
  const isImage = file.mimeType?.startsWith("image/");
  return (
    <li className="flex items-center gap-x3 py-x2">
      <span
        aria-hidden
        className="grid size-x9 shrink-0 place-items-center rounded-r2 bg-bg-neutral-weak text-fg-neutral-subtle"
      >
        {isImage ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
      </span>
      <span className="min-w-0 flex-1 truncate t4-medium text-fg-neutral">{file.name}</span>
      <span className="shrink-0 t3-regular tabular-nums text-fg-neutral-subtle">{formatSize(file.sizeBytes)}</span>
      <Button asChild variant="secondary" size="xs">
        <a
          href={file.url}
          target="_blank"
          rel="noopener"
          download={file.name}
          aria-label={`${file.name} 다운로드`}
        >
          <Download aria-hidden />
          다운로드
        </a>
      </Button>
    </li>
  );
}

// ─── 학생 포털 (variant="portal") ─────────────────────────────────────

const KST_OFFSET = 9 * 60 * 60 * 1000;

/** "9월 20일 오후 3:12" — SSR/CSR 동일 결과가 나오도록 수동 KST 포맷 */
function formatKST(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET);
  const h = kst.getUTCHours();
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const mm = kst.getUTCMinutes().toString().padStart(2, "0");
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${h < 12 ? "오전" : "오후"} ${h12}:${mm}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

const fileIcon = (f: UploadedFile) => (f.mimeType?.startsWith("image/") ? ImageIcon : FileText);

/** 제출 파일 행 — 탭하면 새 탭에서 열기/내려받기 */
function PortalFileRow({ file }: { file: UploadedFile }) {
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener"
      download={file.name}
      aria-label={`${file.name} 내려받기`}
      className="mx-x2 flex items-center gap-x3_5 rounded-r4 px-x3 py-x2_5 transition-colors duration-color-transition active:bg-bg-transparent-pressed"
    >
      <IconTile icon={fileIcon(file)} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate t5-medium text-fg-neutral">{file.name}</p>
        <p className="mt-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">
          {formatSize(file.sizeBytes)}
        </p>
      </div>
      <span className="inline-flex size-x9 shrink-0 items-center justify-center rounded-full bg-bg-neutral-weak text-fg-neutral-muted">
        <Download className="size-x4_5" strokeWidth={2.2} />
      </span>
    </a>
  );
}

/** 피드백에 붙은 첨부 — 말풍선 아래 작은 행 */
function PortalAttachment({ file }: { file: UploadedFile }) {
  const isImage = file.mimeType?.startsWith("image/");
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener"
      download={file.name}
      aria-label={`${file.name} 내려받기`}
      className={cn(
        PRESS,
        "flex items-center gap-x2_5 rounded-r3 bg-bg-layer-fill px-x3 py-x2_5 active:opacity-80"
      )}
    >
      {isImage ? (
        <ImageIcon className="size-x4 shrink-0 text-fg-neutral-subtle" strokeWidth={2.2} />
      ) : (
        <FileText className="size-x4 shrink-0 text-fg-neutral-subtle" strokeWidth={2.2} />
      )}
      <span className="min-w-0 flex-1 truncate t4-medium text-fg-neutral-muted">{file.name}</span>
      <span className="shrink-0 t3-regular tabular-nums text-fg-neutral-subtle">
        {formatSize(file.sizeBytes)}
      </span>
      <Download className="size-x4 shrink-0 text-fg-neutral-muted" strokeWidth={2.2} />
    </a>
  );
}

function PortalThread({
  versions,
  taskStatus,
  canWriteFeedback,
  studentPortalUrl,
}: {
  versions: SubmissionVersion[];
  taskStatus: PerformanceTaskStatus;
  canWriteFeedback: boolean;
  studentPortalUrl?: string;
}) {
  if (versions.length === 0) {
    return (
      <Section>
        <EmptyState icon={Inbox} title="아직 제출한 내용이 없어요" className="py-x6" />
      </Section>
    );
  }

  const latestVersion = versions[0]?.version ?? 1;
  const allowNewFeedback = taskStatus !== "DONE";

  return (
    <div className="flex flex-col gap-x3">
      {versions.map((sub) => {
        const isLatest = sub.version === latestVersion;
        return (
          <Section
            key={sub.id}
            flush
            title={
              <span className="flex items-center gap-x2">
                v{sub.version} 제출
                {isLatest && <Badge tone="brand">최신</Badge>}
              </span>
            }
            description={<span className="tabular-nums">{formatKST(sub.submittedAt)}</span>}
            action={
              sub.feedbacks.length > 0 ? (
                <span className="inline-flex shrink-0 items-center gap-x1 t3-medium tabular-nums text-fg-neutral-subtle">
                  <MessageSquare className="size-x4" strokeWidth={2.2} />
                  {sub.feedbacks.length}
                </span>
              ) : undefined
            }
          >
            {/* 첨부 파일 */}
            <p className="px-x5 pb-x1 pt-x3 t4-bold text-fg-neutral-muted">
              첨부 파일 <span className="tabular-nums">{sub.files.length}</span>
            </p>
            {sub.files.map((f, i) => (
              <PortalFileRow key={i} file={f} />
            ))}

            {/* 학생 코멘트 */}
            {sub.note && (
              <div className="px-x5 pt-x4">
                <p className="t4-bold text-fg-neutral-muted">내가 남긴 말</p>
                <p className="mt-x2 whitespace-pre-wrap break-words rounded-r4 bg-bg-layer-fill px-x4 py-x3 t5-regular text-fg-neutral-muted">
                  {sub.note}
                </p>
              </div>
            )}

            {/* 피드백 */}
            {sub.feedbacks.length > 0 && (
              <div className="px-x5 pt-x5">
                <p className="t4-bold text-fg-neutral-muted">
                  받은 피드백 <span className="tabular-nums">{sub.feedbacks.length}</span>
                </p>
                <ul className="mt-x3 flex flex-col gap-x5">
                  {sub.feedbacks.map((f) => {
                    const st = FEEDBACK_STATUS[f.status];
                    return (
                      <li key={f.id} className="flex gap-x3">
                        <Avatar name={f.authorName} size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-x1_5 gap-y-x1">
                            <span className="t5-bold text-fg-neutral">{f.authorName}</span>
                            <Badge tone={st.tone} size="xs">
                              {st.label}
                            </Badge>
                            <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                              {formatKST(f.createdAt)}
                            </span>
                          </div>
                          <p className="mt-x1_5 whitespace-pre-wrap break-words t5-regular text-fg-neutral-muted">
                            {f.content}
                          </p>
                          {f.files && f.files.length > 0 && (
                            <div className="mt-x2_5 flex flex-col gap-x1_5">
                              {f.files.map((af, i) => (
                                <PortalAttachment key={i} file={af} />
                              ))}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* 피드백 작성 — 포털에선 canWriteFeedback=false 지만 계약 유지 */}
            {isLatest && canWriteFeedback && allowNewFeedback && (
              <div id={`feedback-v${sub.version}`} className="scroll-mt-4 px-x5 pt-x4">
                <TaskFeedbackForm submissionId={sub.id} versionLabel={`v${sub.version} 제출물`} />
              </div>
            )}

            <div aria-hidden className="h-x3" />
          </Section>
        );
      })}
      {studentPortalUrl && <Link href={studentPortalUrl} className="hidden" />}
    </div>
  );
}
