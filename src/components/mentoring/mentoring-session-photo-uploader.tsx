"use client";

// Sprint 5 PR 5.1 — 화상 세션 KDA / EXTRA / FREE 사진 업로드 위젯.
// /api/upload/mentoring-session 으로 PUT → `attachSessionPhoto` 로 DB row 생성.
// 폼 저장과 무관하게 업로드 즉시 영속 — 노트 작성 중 사진 유실 방지.

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { ImagePlus, X, Loader2, FileText, Trash2 } from "lucide-react";
import {
  attachSessionPhoto,
  deleteSessionPhoto,
  type SessionPhotoInput,
} from "@/actions/mentoring";
import type { MentoringPhotoTag } from "@/generated/prisma";

export type SessionPhotoRow = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  mimeType: string;
  tag: MentoringPhotoTag;
  caption: string | null;
};

const ALLOWED_EXT = /\.(pdf|png|jpe?g|webp)$/i;

export function MentoringSessionPhotoUploader({
  sessionId,
  tag,
  label,
  description,
  photos,
  onChange,
  disabled,
  max = 12,
}: {
  sessionId: string;
  tag: MentoringPhotoTag;
  label: string;
  description?: string;
  photos: SessionPhotoRow[];
  onChange: (next: SessionPhotoRow[]) => void;
  disabled?: boolean;
  max?: number;
}) {
  const inputId = useId();
  const [uploadingCount, setUploadingCount] = useState(0);
  const [, startTransition] = useTransition();

  const tagged = photos.filter((p) => p.tag === tag);
  const full = tagged.length + uploadingCount >= max;

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const room = max - tagged.length - uploadingCount;
    if (room <= 0) {
      toast.error(`최대 ${max}장까지 첨부할 수 있어요`);
      return;
    }
    const picked = files.slice(0, room);
    if (picked.length < files.length) {
      toast.error(`최대 ${max}장 — ${picked.length}장만 추가했어요`);
    }

    for (const file of picked) {
      if (!ALLOWED_EXT.test(file.name) && !file.type.startsWith("image/") && file.type !== "application/pdf") {
        toast.error(`${file.name}: 이미지 또는 PDF 만 첨부할 수 있어요`);
        continue;
      }
      setUploadingCount((c) => c + 1);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("sessionId", sessionId);
        fd.append("tag", tag);
        const res = await fetch("/api/upload/mentoring-session", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "업로드 실패");

        const payload: SessionPhotoInput = {
          url: data.url,
          mimeType: data.mimeType,
          tag,
        };
        const created = await attachSessionPhoto(sessionId, payload);
        onChange([
          ...photos,
          {
            id: created.id,
            url: created.url,
            thumbnailUrl: created.thumbnailUrl,
            mimeType: created.mimeType,
            tag: created.tag,
            caption: created.caption,
          },
        ]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "업로드 실패");
      } finally {
        setUploadingCount((c) => c - 1);
      }
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("이 첨부를 삭제할까요? 되돌릴 수 없습니다.")) return;
    startTransition(async () => {
      try {
        await deleteSessionPhoto(id);
        onChange(photos.filter((p) => p.id !== id));
        toast.success("삭제되었습니다");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h6 className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide">
            {label}
            <span className="ml-1.5 tabular-nums text-ink-5">
              {tagged.length}
              {max < 99 ? `/${max}` : ""}
            </span>
          </h6>
          {description && (
            <p className="text-[10.5px] text-ink-5 mt-0.5">{description}</p>
          )}
        </div>
      </div>

      {(tagged.length > 0 || uploadingCount > 0) && (
        <ul className="flex flex-wrap gap-2">
          {tagged.map((p) => (
            <li
              key={p.id}
              className="relative h-20 w-20 overflow-hidden rounded-[10px] border border-line bg-canvas-2 group"
            >
              {p.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.thumbnailUrl ?? p.url}
                  alt={p.caption ?? label}
                  className="h-full w-full object-cover"
                />
              ) : (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener"
                  className="flex h-full w-full flex-col items-center justify-center gap-1 p-1.5 text-ink-4"
                >
                  <FileText className="h-5 w-5" />
                  <span className="line-clamp-2 break-all text-center text-[9px] leading-tight">
                    PDF
                  </span>
                </a>
              )}
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                disabled={disabled}
                aria-label="첨부 삭제"
                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink/80 text-white opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
              >
                <Trash2 className="h-3 w-3" strokeWidth={2.5} />
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
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-line bg-panel px-3 py-2 text-[12px] font-medium text-ink-2 hover:bg-canvas-2 ${
            disabled || uploadingCount > 0 ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {uploadingCount > 0 ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
          사진/PDF 추가
          <input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            multiple
            onChange={handleFiles}
            disabled={disabled || uploadingCount > 0}
            className="hidden"
          />
        </label>
      )}

      {tagged.length === 0 && uploadingCount === 0 && (
        <p className="text-[10.5px] text-ink-5">아직 첨부된 파일이 없습니다.</p>
      )}
    </div>
  );
}

export function MentoringSessionPhotosPanel({
  sessionId,
  initialPhotos,
  disabled,
}: {
  sessionId: string;
  initialPhotos: SessionPhotoRow[];
  disabled?: boolean;
}) {
  const [photos, setPhotos] = useState<SessionPhotoRow[]>(initialPhotos);

  return (
    <div className="space-y-4 rounded-[10px] border border-line bg-canvas-2/40 p-3">
      <header className="flex items-center justify-between">
        <h5 className="text-[12px] font-semibold text-ink">
          첨부 사진 / 파일
          <span className="ml-1.5 tabular-nums text-ink-5">{photos.length}</span>
        </h5>
        <X className="hidden" />
      </header>
      <MentoringSessionPhotoUploader
        sessionId={sessionId}
        tag="KDA"
        label="KDA 사진"
        description="학습량 검증용 — 카톡 일일 인증 / 좌석 / 과제 사진"
        photos={photos}
        onChange={setPhotos}
        disabled={disabled}
      />
      <MentoringSessionPhotoUploader
        sessionId={sessionId}
        tag="EXTRA"
        label="참고 자료"
        description="부교재·기출지·해설지 등 세션에서 같이 본 자료"
        photos={photos}
        onChange={setPhotos}
        disabled={disabled}
      />
      <MentoringSessionPhotoUploader
        sessionId={sessionId}
        tag="FREE"
        label="자유 첨부"
        description="메모·칠판 사진·기타 자유롭게"
        photos={photos}
        onChange={setPhotos}
        disabled={disabled}
      />
    </div>
  );
}
