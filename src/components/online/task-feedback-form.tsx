"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { createFeedback } from "@/actions/online/task-submissions";
import type { UploadedFile } from "@/actions/online/task-submissions";
import type { TaskFeedbackStatus } from "@/generated/prisma";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, FormField } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/online/online-confirm-dialog";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: TaskFeedbackStatus; label: string; hint: string }[] = [
  { value: "COMMENT", label: "코멘트", hint: "단순 의견 — 상태 변화 없음" },
  { value: "NEEDS_REVISION", label: "수정 요청", hint: "학생이 다시 제출해야 함 → 상태: 수정 필요" },
  { value: "APPROVED", label: "최종 승인", hint: "수행평가 종료 → 상태: 최종 완료" },
];

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function TaskFeedbackForm({
  submissionId,
  versionLabel,
}: {
  submissionId: string;
  versionLabel?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<TaskFeedbackStatus>("COMMENT");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentId = `feedback-content-${submissionId}`;
  const headingId = `feedback-heading-${submissionId}`;

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    setUploading(true);
    try {
      const uploaded: UploadedFile[] = [];
      for (const f of picked) {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("context", "feedback");
        fd.append("submissionId", submissionId);
        const res = await fetch("/api/online/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "업로드 실패");
        }
        const data = (await res.json()) as UploadedFile;
        uploaded.push(data);
      }
      setFiles((prev) => [...prev, ...uploaded]);
      toast.success(`${uploaded.length}개 파일 업로드 완료`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function submit() {
    startTransition(async () => {
      try {
        await createFeedback({ submissionId, content, status, files });
        toast.success("피드백이 작성되었습니다");
        setContent("");
        setStatus("COMMENT");
        setFiles([]);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "작성 실패");
      }
    });
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("피드백 내용을 입력하세요");
      return;
    }
    if (status === "APPROVED") {
      setConfirmOpen(true);
      return;
    }
    submit();
  };

  return (
    <>
      <form onSubmit={onSubmit} aria-labelledby={headingId} className="flex flex-col gap-x4">
        <h3 id={headingId} className="t5-bold text-fg-neutral">
          {versionLabel ? `${versionLabel}에 대한 피드백 작성` : "피드백 작성"}
        </h3>

        <FormField label="피드백 내용" htmlFor={contentId} required>
          <Textarea
            id={contentId}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="제출 내용을 확인한 뒤 학생에게 전달할 피드백을 작성하세요. 아래에서 상태도 선택."
            className="resize-y"
          />
        </FormField>

        {/* 첨부 파일 */}
        <div className="flex flex-col gap-x2">
          <div className="flex items-center justify-between gap-x3">
            <span className="t4-medium text-fg-neutral">
              첨부 파일
              {files.length > 0 && <span className="ml-x1 tabular-nums text-fg-neutral-subtle">{files.length}</span>}
            </span>
            <label
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-stroke-focus-ring",
                uploading && "pointer-events-none opacity-60",
              )}
            >
              {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Paperclip aria-hidden />}
              {uploading ? "올리는 중…" : "파일 추가"}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFilePick}
                disabled={uploading}
                className="sr-only"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.doc,.hwp,.hwpx,.zip"
              />
            </label>
          </div>
          {files.length > 0 && (
            <ul className="flex flex-col gap-x1">
              {files.map((f, i) => {
                const isImage = f.mimeType?.startsWith("image/");
                return (
                  <li
                    key={`${f.url}-${i}`}
                    className="flex items-center gap-x3 rounded-r2 bg-bg-layer-fill py-x1 pl-x3 pr-x1"
                  >
                    {isImage ? (
                      <ImageIcon className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
                    ) : (
                      <FileText className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate t4-regular text-fg-neutral">{f.name}</span>
                    <span className="shrink-0 t3-regular tabular-nums text-fg-neutral-subtle">
                      {formatSize(f.sizeBytes)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFile(i)}
                      aria-label="첨부 제거"
                      title="제거"
                      className="size-8"
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 상태 선택 */}
        <fieldset className="min-w-0">
          <legend className="mb-x2 t4-medium text-fg-neutral">처리 상태</legend>
          <div className="grid grid-cols-1 gap-x2 sm:grid-cols-3">
            {STATUS_OPTIONS.map((opt) => {
              const selected = status === opt.value;
              return (
                <label
                  key={opt.value}
                  className={cn(
                    "cursor-pointer rounded-r2 px-x4 py-x3 transition-colors",
                    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-stroke-focus-ring",
                    selected
                      ? "bg-bg-layer-fill shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)]"
                      : "bg-bg-layer-default shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed",
                  )}
                >
                  <input
                    type="radio"
                    name="status"
                    value={opt.value}
                    checked={selected}
                    onChange={(e) => setStatus(e.target.value as TaskFeedbackStatus)}
                    className="sr-only"
                  />
                  <span className="block t4-bold text-fg-neutral">{opt.label}</span>
                  <span className="mt-x0_5 block t3-regular text-fg-neutral-subtle">{opt.hint}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <FormActions className="pt-x1">
          <Button
            type="submit"
            variant="brand"
            disabled={isPending || uploading || !content.trim()}
            className="w-full sm:w-auto"
          >
            {isPending ? "등록 중…" : "피드백 등록"}
          </Button>
        </FormActions>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="최종 승인할까요?"
        description="최종 승인하면 수행평가가 '최종 완료' 상태로 바뀌어요."
        confirmLabel="최종 승인"
        pending={isPending}
        onConfirm={() => {
          setConfirmOpen(false);
          submit();
        }}
      />
    </>
  );
}
