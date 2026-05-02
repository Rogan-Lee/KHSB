"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquarePlus, Paperclip, X, Loader2 } from "lucide-react";
import { createFeedback } from "@/actions/online/task-submissions";
import type { UploadedFile } from "@/actions/online/task-submissions";
import type { TaskFeedbackStatus } from "@/generated/prisma";

const STATUS_OPTIONS: { value: TaskFeedbackStatus; label: string; hint: string }[] = [
  { value: "COMMENT", label: "코멘트", hint: "단순 의견 — 상태 변화 없음" },
  { value: "NEEDS_REVISION", label: "수정 요청", hint: "학생이 다시 제출해야 함 → 상태: 수정 필요" },
  { value: "APPROVED", label: "최종 승인", hint: "수행평가 종료 → 상태: 최종 완료" },
];

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("피드백 내용을 입력하세요");
      return;
    }
    if (status === "APPROVED") {
      if (!confirm("최종 승인 시 수행평가가 '최종 완료' 상태로 전환됩니다. 계속하시겠어요?")) {
        return;
      }
    }
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
  };

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-[12px] border-2 border-ink/10 bg-panel p-4 shadow-sm"
    >
      <h3 className="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5">
        <MessageSquarePlus className="h-3.5 w-3.5 text-ink-3" />
        {versionLabel ? `${versionLabel} 에 대한 피드백 작성` : "피드백 작성"}
      </h3>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        placeholder="제출 내용을 확인한 뒤 학생에게 전달할 피드백을 작성하세요. 아래에서 상태도 선택."
        className="w-full rounded-[8px] border border-line bg-canvas px-3 py-2 text-[12.5px] text-ink resize-y focus:outline-none focus:border-line-strong"
      />

      {/* 첨부 파일 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide">
            첨부 파일{files.length > 0 ? ` (${files.length})` : ""}
          </span>
          <label className="inline-flex items-center gap-1 cursor-pointer rounded-[6px] border border-line bg-panel px-2 py-1 text-[11px] text-ink-3 hover:border-line-strong hover:text-ink">
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Paperclip className="h-3 w-3" />
            )}
            파일 추가
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
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li
                key={`${f.url}-${i}`}
                className="flex items-center gap-2 rounded-[6px] bg-canvas-2 px-3 py-1.5 text-[12px]"
              >
                <Paperclip className="h-3.5 w-3.5 text-ink-4 shrink-0" />
                <span className="flex-1 truncate text-ink">{f.name}</span>
                <span className="shrink-0 text-[10.5px] text-ink-5 tabular-nums">
                  {(f.sizeBytes / 1024 / 1024).toFixed(1)}MB
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-ink-5 hover:text-red-600"
                  title="제거"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`cursor-pointer rounded-[8px] border px-3 py-2 text-[12px] flex-1 min-w-[140px] ${
              status === opt.value
                ? "border-ink bg-canvas-2"
                : "border-line bg-panel hover:border-line-strong"
            }`}
          >
            <input
              type="radio"
              name="status"
              value={opt.value}
              checked={status === opt.value}
              onChange={(e) => setStatus(e.target.value as TaskFeedbackStatus)}
              className="sr-only"
            />
            <div className="font-semibold text-ink">{opt.label}</div>
            <div className="text-[11px] text-ink-4 mt-0.5">{opt.hint}</div>
          </label>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || uploading || !content.trim()}
          className="rounded-[8px] bg-ink text-white px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50"
        >
          {isPending ? "작성 중..." : "피드백 등록"}
        </button>
      </div>
    </form>
  );
}
