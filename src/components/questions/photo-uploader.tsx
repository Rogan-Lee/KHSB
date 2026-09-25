"use client";

import { useId, useState } from "react";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { ImagePlus, X, Loader2, FileText, Play } from "lucide-react";
import { ProgressCircle } from "seed-design/ui/progress-circle";
import type { QuestionAttachment } from "@/actions/student-questions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
 * variant="portal" 은 학생 포털용 SEED 토큰 썸네일 줄 (업로드 로직은 동일).
 */
export function PhotoUploader({
  attachments,
  onChange,
  studentToken,
  max = 6,
  disabled,
  label = "사진 추가",
  variant = "default",
}: {
  attachments: QuestionAttachment[];
  onChange: (next: QuestionAttachment[]) => void;
  studentToken?: string;
  max?: number;
  disabled?: boolean;
  label?: string;
  variant?: "default" | "portal";
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

  if (variant === "portal") {
    const addDisabled = full || disabled || busy;
    return (
      <ul className="-mx-4 flex gap-x2 overflow-x-auto px-x4 pb-x1 pt-x2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <li className="shrink-0">
          <label
            htmlFor={inputId}
            className={cn(
              "flex size-[76px] cursor-pointer flex-col items-center justify-center gap-x1 rounded-r3_5 bg-bg-neutral-weak text-fg-neutral-muted transition-[transform,background-color] duration-150 active:scale-[0.96] active:bg-bg-neutral-weak-pressed",
              addDisabled && "pointer-events-none opacity-50"
            )}
          >
            <ImagePlus className="size-x6" strokeWidth={2} />
            <span className="t3-medium tabular-nums text-fg-neutral-subtle">
              <span className={attachments.length > 0 ? "t3-bold text-fg-brand" : undefined}>
                {attachments.length}
              </span>
              /{max}
            </span>
            <span className="sr-only">{label}</span>
            {/* capture 미지정 — 모바일에서 카메라 촬영 / 갤러리 선택 둘 다 가능 */}
            <input
              id={inputId}
              type="file"
              accept="image/*,video/mp4,video/quicktime,video/webm,.pdf,.heic,.heif,.mp4,.mov,.webm"
              multiple
              onChange={handleFiles}
              disabled={addDisabled}
              className="hidden"
            />
          </label>
        </li>

        {attachments.map((a, i) => (
          <li
            key={`${a.url}-${i}`}
            className="relative size-[76px] shrink-0 overflow-hidden rounded-r3_5 bg-bg-neutral-weak"
          >
            {a.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
            ) : a.mimeType.startsWith("video/") ? (
              <div className="relative h-full w-full">
                <video
                  src={a.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
                <span className="absolute left-1/2 top-1/2 inline-flex size-x7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-bg-overlay text-palette-static-white">
                  <Play className="ml-x0_5 size-x3_5 fill-current" strokeWidth={2.4} />
                </span>
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-x1 px-x2 text-fg-neutral-subtle">
                <FileText className="size-x5" strokeWidth={2} />
                <span className="line-clamp-2 break-all text-center t1-regular">
                  {a.name}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="첨부 제거"
              className="absolute right-1 top-1 inline-flex size-x6 items-center justify-center rounded-full bg-bg-overlay text-palette-static-white backdrop-blur-sm transition-transform active:scale-90"
            >
              <X className="size-x3_5" strokeWidth={2.8} />
            </button>
          </li>
        ))}

        {Array.from({ length: uploadingCount }).map((_, i) => (
          <li
            key={`u-${i}`}
            className="flex size-[76px] shrink-0 flex-col items-center justify-center gap-x1_5 overflow-hidden rounded-r3_5 bg-bg-neutral-weak text-fg-neutral-muted"
            aria-label="업로드 중"
          >
            {/* 진행률을 알면 SEED ProgressCircle 을 결정형으로, 모르면(준비 중) 무한 회전으로 */}
            <ProgressCircle
              size="24"
              tone="brand"
              value={progress ?? undefined}
              minValue={0}
              maxValue={100}
            />
            <span className="t2-medium tabular-nums">
              {progress !== null ? `${progress}%` : "준비 중"}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  // ─── default variant (직원 화면) ───
  return (
    <div>
      {(attachments.length > 0 || busy) && (
        <ul className="mb-x2 flex flex-wrap gap-x2">
          {attachments.map((a, i) => (
            <li
              key={`${a.url}-${i}`}
              className="relative size-20 overflow-hidden rounded-r2 border border-stroke-neutral-muted bg-bg-neutral-weak"
            >
              {a.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
              ) : a.mimeType.startsWith("video/") ? (
                <div className="flex h-full w-full items-center justify-center text-fg-neutral-subtle">
                  <Play className="size-5 fill-current" aria-hidden />
                  <span className="sr-only">{a.name}</span>
                </div>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-x1 p-x1_5 text-fg-neutral-subtle">
                  <FileText className="size-5" />
                  <span className="line-clamp-2 break-all text-center t1-regular">
                    {a.name}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="첨부 제거"
                className="absolute right-1 top-1 inline-flex size-x5 items-center justify-center rounded-full bg-bg-overlay text-palette-static-white"
              >
                <X className="size-3" strokeWidth={3} />
              </button>
            </li>
          ))}
          {Array.from({ length: uploadingCount }).map((_, i) => (
            <li
              key={`u-${i}`}
              aria-label="업로드 중"
              className="flex size-20 flex-col items-center justify-center gap-x1 rounded-r2 border border-dashed border-stroke-neutral-weak bg-bg-layer-fill text-fg-neutral-subtle"
            >
              <Loader2 className="size-5 animate-spin" />
              {progress !== null && (
                <span className="t1-regular tabular-nums">{progress}%</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <label
          htmlFor={inputId}
          className={cn(
            buttonVariants({ variant: "secondary", size: "sm" }),
            "cursor-pointer",
            (disabled || busy) && "pointer-events-none opacity-50",
          )}
        >
          {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
          {label}
          <span className="t3-regular tabular-nums text-fg-neutral-subtle">
            {attachments.length}/{max}
          </span>
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
