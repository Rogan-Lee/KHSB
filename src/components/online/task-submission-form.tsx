"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, X, Paperclip } from "lucide-react";
import {
  createOrUpdateSubmission,
  type UploadedFile,
} from "@/actions/online/task-submissions";

export function TaskSubmissionForm({
  studentToken,
  taskId,
  initialFiles,
  initialNote,
  isSubmitted,
}: {
  studentToken: string;
  taskId: string;
  initialFiles: UploadedFile[];
  initialNote: string | null;
  isSubmitted: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [files, setFiles] = useState<UploadedFile[]>(initialFiles);
  const [note, setNote] = useState(initialNote ?? "");
  const [uploadingName, setUploadingName] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재업로드 가능하도록 초기화
    if (!file) return;

    if (files.length >= 5) {
      toast.error("최대 5개까지 첨부 가능합니다");
      return;
    }

    setUploadingName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("taskId", taskId);
      formData.append("studentToken", studentToken);

      const res = await fetch("/api/online/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "업로드 실패");

      setFiles((prev) => [
        ...prev,
        {
          url: data.url,
          name: data.name,
          sizeBytes: data.sizeBytes,
          mimeType: data.mimeType,
        },
      ]);
      toast.success(`${file.name} 업로드 완료`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploadingName(null);
    }
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const onSubmit = () => {
    if (files.length === 0) {
      toast.error("최소 1개의 파일을 첨부하세요");
      return;
    }
    startTransition(async () => {
      try {
        await createOrUpdateSubmission({
          studentToken,
          taskId,
          files,
          note: note.trim() || null,
        });
        toast.success("제출이 완료되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "제출 실패");
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-[10px] border border-line bg-panel p-3">
        <p className="text-[12px] font-semibold text-ink mb-2">첨부 파일</p>
        {files.length === 0 ? (
          <p className="text-[11.5px] text-ink-5">
            최대 5개, 파일당 50MB. PDF · PNG · JPG · DOCX · HWP · ZIP
          </p>
        ) : (
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-[6px] bg-canvas-2 px-2 py-1.5 text-[12px]"
              >
                <Paperclip className="h-3.5 w-3.5 text-ink-4 shrink-0" />
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener"
                  className="flex-1 truncate text-ink hover:underline"
                >
                  {f.name}
                </a>
                <span className="shrink-0 text-[11px] text-ink-5">
                  {(f.sizeBytes / 1024 / 1024).toFixed(1)}MB
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="p-1 text-ink-4 hover:text-red-500"
                  title="제거"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {files.length < 5 && (
          <label className="mt-2 inline-flex items-center gap-1.5 cursor-pointer rounded-[8px] border border-dashed border-line hover:border-line-strong px-3 py-1.5 text-[12px] font-medium text-ink-3 hover:text-ink transition-colors">
            <Upload className="h-3.5 w-3.5" />
            {uploadingName ? `${uploadingName} 업로드 중...` : "파일 선택"}
            <input
              type="file"
              onChange={handleFileChange}
              className="hidden"
              disabled={!!uploadingName}
              accept=".pdf,.png,.jpg,.jpeg,.docx,.doc,.hwp,.hwpx,.zip"
            />
          </label>
        )}
      </div>

      <label className="block">
        <span className="text-[12px] font-semibold text-ink">코멘트 (선택)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="컨설턴트에게 전달할 내용이 있으면 적어 주세요"
          className="mt-1 w-full rounded-[8px] border border-line bg-canvas px-3 py-2 text-[12.5px] text-ink resize-y focus:outline-none focus:border-line-strong"
        />
      </label>

      <button
        type="button"
        onClick={onSubmit}
        disabled={isPending || !!uploadingName}
        className="w-full rounded-[8px] bg-ink text-white px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50"
      >
        {isPending ? "제출 중..." : isSubmitted ? "재제출" : "제출하기"}
      </button>
    </div>
  );
}
