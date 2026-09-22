"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, X, Loader2, FileText } from "lucide-react";
import type { QuestionAttachment } from "@/actions/student-questions";

const ALLOWED_EXT = /\.(pdf|png|jpe?g|webp|gif|heic|heif)$/i;

// Vercel serverless 요청 body 한도(4.5MB)에 걸리지 않도록 업로드 전 클라에서 축소.
// (서버 라우트의 50MB 허용은 Vercel 앞단에서 무의미 — 근본 해결은 blob client upload로 예정)
const VERCEL_BODY_LIMIT_BYTES = 4 * 1024 * 1024; // 여유분 두고 4MB
const RESIZE_MAX_SIDE = 2048;

/** 이미지를 canvas 로 장변 2048px / JPEG 0.85 로 축소. 디코드 불가(heic 등)면 원본 반환. */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const isHeic = file.type === "image/heic" || file.type === "image/heif";
  // 이미 충분히 작으면 재인코딩으로 화질만 깎지 않는다 (heic 은 표시 호환 위해 항상 변환 시도)
  if (file.size <= VERCEL_BODY_LIMIT_BYTES && !isHeic) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, RESIZE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    // heic 등 브라우저가 디코드 못 하는 포맷 — 원본 그대로 (아래 크기 검사에서 안내)
    return file;
  }
}

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
        const upload = await compressImage(file);
        if (upload.size > VERCEL_BODY_LIMIT_BYTES) {
          throw new Error(
            `${file.name}: 파일이 너무 커요 (${(upload.size / 1024 / 1024).toFixed(1)}MB). 4MB 이하로 줄여서 올려주세요`
          );
        }
        const fd = new FormData();
        fd.append("file", upload);
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
