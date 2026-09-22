"use client";

import { useId, useState } from "react";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { ImagePlus, X, Loader2, FileText } from "lucide-react";
import type { QuestionAttachment } from "@/actions/student-questions";

const ALLOWED_EXT = /\.(pdf|png|jpe?g|webp|gif|heic|heif|mp4|mov|webm)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm)$/i;

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

// blob client upload 라 서버 body 한도는 없지만, 전송량 절약을 위해 큰 이미지는 클라에서 축소.
const COMPRESS_THRESHOLD_BYTES = 4 * 1024 * 1024;
const RESIZE_MAX_SIDE = 2048;

/** 이미지를 canvas 로 장변 2048px / JPEG 0.85 로 축소. 디코드 불가(heic 등)면 원본 반환. */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const isHeic = file.type === "image/heic" || file.type === "image/heif";
  // 이미 충분히 작으면 재인코딩으로 화질만 깎지 않는다 (heic 은 표시 호환 위해 항상 변환 시도)
  if (file.size <= COMPRESS_THRESHOLD_BYTES && !isHeic) return file;
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
    // heic 등 브라우저가 디코드 못 하는 포맷 — 원본 그대로 (blob 에서는 표시가 안 될 수 있음)
    return file;
  }
}

function safeName(filename: string): string {
  return filename.replace(/[\\/]/g, "_").replace(/\.\./g, "_").slice(0, 200);
}

/**
 * 질문/답변용 사진·영상(+PDF) 첨부 업로더. 컨트롤드 컴포넌트.
 * @vercel/blob client upload (/api/online/upload/client 토큰 발급) 로 blob 에 직접 업로드 —
 * Vercel 함수 body 한도(4.5MB)를 우회한다.
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
  const [progress, setProgress] = useState<number | null>(null);
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
      const isVideo = VIDEO_EXT.test(file.name) || file.type.startsWith("video/");
      if (!ALLOWED_EXT.test(file.name) && !file.type.startsWith("image/") && !isVideo) {
        toast.error(`${file.name}: 사진·영상 또는 PDF만 첨부할 수 있어요`);
        continue;
      }
      setUploadingCount((c) => c + 1);
      setProgress(null);
      try {
        // 영상은 리사이즈 없이 원본 그대로, 이미지는 전송량 절약을 위해 축소
        const body = isVideo ? file : await compressImage(file);
        const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (body.size > limit) {
          throw new Error(
            `${file.name}: 파일이 너무 커요 (${(body.size / 1024 / 1024).toFixed(1)}MB). ${
              isVideo ? "영상은 200MB" : "사진·PDF는 20MB"
            } 이하로 올려주세요`
          );
        }
        const random = Math.random().toString(36).slice(2, 10);
        const blob = await upload(
          `student-questions/incoming/${Date.now()}-${random}-${safeName(body.name)}`,
          body,
          {
            access: "public",
            handleUploadUrl: "/api/online/upload/client",
            clientPayload: JSON.stringify({ context: "question", studentToken }),
            contentType: body.type || undefined,
            multipart: isVideo, // 대용량 영상은 분할 업로드 + 실패 파트 재시도
            onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
          }
        );
        onChange([
          ...attachments,
          {
            url: blob.url,
            name: body.name,
            sizeBytes: body.size,
            mimeType: body.type || blob.contentType || "application/octet-stream",
          },
        ]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "업로드 실패");
      } finally {
        setUploadingCount((c) => c - 1);
        setProgress(null);
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
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-line bg-canvas-2 text-ink-4"
            >
              <Loader2 className="h-5 w-5 animate-spin" />
              {progress !== null && (
                <span className="text-[10px] tabular-nums">{progress}%</span>
              )}
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
            accept="image/*,video/mp4,video/quicktime,video/webm,.pdf,.heic,.heif,.mp4,.mov,.webm"
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
