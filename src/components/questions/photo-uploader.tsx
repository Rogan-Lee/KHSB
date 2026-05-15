"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, X, Loader2, FileText } from "lucide-react";
import type { QuestionAttachment } from "@/actions/student-questions";

const ALLOWED_EXT = /\.(pdf|png|jpe?g|webp|gif|heic|heif)$/i;

/**
 * 질문/답변용 사진(+PDF) 첨부 업로더. 컨트롤드 컴포넌트.
 * /api/online/upload 의 context=question 으로 업로드.
 * 학생 측이면 studentToken 전달, 직원 측이면 생략(세션 인증).
 */
export function PhotoUploader({
  attachments,
  onChange,
  studentToken,
  max = 6,
  disabled,
  label = "사진 추가",
}: {
  attachments: QuestionAttachment[];
  onChange: (next: QuestionAttachment[]) => void;
  studentToken?: string;
  max?: number;
  disabled?: boolean;
  label?: string;
}) {
  const [uploadingCount, setUploadingCount] = useState(0);
  const inputId = useId();

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const room = max - attachments.length - uploadingCount;
    if (room <= 0) {
      toast.error(`최대 ${max}장까지 첨부할 수 있어요`);
      return;
    }
    const picked = files.slice(0, room);
    if (picked.length < files.length) {
      toast.error(`최대 ${max}장까지 — ${picked.length}장만 추가했어요`);
    }

    for (const file of picked) {
      if (!ALLOWED_EXT.test(file.name) && !file.type.startsWith("image/")) {
        toast.error(`${file.name}: 사진 또는 PDF만 첨부할 수 있어요`);
        continue;
      }
      setUploadingCount((c) => c + 1);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("context", "question");
        if (studentToken) fd.append("studentToken", studentToken);
        const res = await fetch("/api/online/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "업로드 실패");
        onChange([
          ...attachments,
          { url: data.url, name: data.name, sizeBytes: data.sizeBytes, mimeType: data.mimeType },
        ]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "업로드 실패");
      } finally {
        setUploadingCount((c) => c - 1);
      }
    }
  };

  const remove = (idx: number) => onChange(attachments.filter((_, i) => i !== idx));

  const full = attachments.length + uploadingCount >= max;
  const busy = uploadingCount > 0;

  return (
    <div>
      {(attachments.length > 0 || busy) && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <li
              key={`${a.url}-${i}`}
              className="relative h-20 w-20 overflow-hidden rounded-[10px] border border-line bg-canvas-2"
            >
              {a.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1.5 text-ink-4">
                  <FileText className="h-5 w-5" />
                  <span className="line-clamp-2 break-all text-center text-[9px] leading-tight">
                    {a.name}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="첨부 제거"
                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink/80 text-white"
              >
                <X className="h-3 w-3" strokeWidth={3} />
              </button>
            </li>
          ))}
          {Array.from({ length: uploadingCount }).map((_, i) => (
            <li
              key={`u-${i}`}
              className="flex h-20 w-20 items-center justify-center rounded-[10px] border border-dashed border-line bg-canvas-2 text-ink-4"
            >
              <Loader2 className="h-5 w-5 animate-spin" />
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <label
          htmlFor={inputId}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-line bg-panel px-3 py-2 text-[13px] font-medium text-ink-2 active:bg-canvas-2 ${
            disabled || busy ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {label}
          {/* capture 미지정 — 모바일에서 카메라 촬영 / 갤러리 선택 둘 다 가능 */}
          <input
            id={inputId}
            type="file"
            accept="image/*,.pdf,.heic,.heif"
            multiple
            onChange={handleFiles}
            disabled={disabled || busy}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}
