"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";
import {
  attachMentoringPhoto,
  deleteMentoringPhoto,
} from "@/actions/mentoring";
import type { MentoringPhotoTag, Photo } from "@/generated/prisma";

const ALLOWED_EXT = /\.(png|jpe?g|webp|gif)$/i;

// KDA 는 운영 종료 — 신규 업로드 존에서 제외. 과거 KDA 사진은 아래에서 읽기 전용으로 표시.
const ZONES: { tag: MentoringPhotoTag; label: string; hint: string }[] = [
  { tag: "EXTRA", label: "추가 자료", hint: "보조 풀이/참고 자료" },
  { tag: "FREE", label: "자유 첨부", hint: "기타 자유 첨부" },
];

/**
 * 오프라인 멘토링 기록 추가 / 자유 첨부 업로더 (Sprint 5 PR 5.1 이식).
 * `/api/upload/mentoring` 으로 파일 업로드 후
 * `attachMentoringPhoto` 서버 액션으로 DB 기록.
 */
export function MentoringPhotoUploader({
  mentoringId,
  existing,
}: {
  mentoringId: string;
  existing: Photo[];
}) {
  const legacyKda = existing.filter((p) => p.mentoringTag === "KDA");
  return (
    <div className="flex flex-col gap-x5">
      {ZONES.map((zone) => (
        <ZoneBlock
          key={zone.tag}
          mentoringId={mentoringId}
          tag={zone.tag}
          label={zone.label}
          hint={zone.hint}
          photos={existing.filter((p) => (p.mentoringTag ?? "FREE") === zone.tag)}
        />
      ))}
      {legacyKda.length > 0 && (
        <ZoneBlock
          mentoringId={mentoringId}
          tag="KDA"
          label="핵심 자료 (KDA)"
          hint="운영 종료 — 과거 자료만 표시 (신규 업로드 불가)"
          photos={legacyKda}
          readOnly
        />
      )}
    </div>
  );
}

function ZoneBlock({
  mentoringId,
  tag,
  label,
  hint,
  photos,
  readOnly = false,
}: {
  mentoringId: string;
  tag: MentoringPhotoTag;
  label: string;
  hint: string;
  photos: Photo[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const [uploadingCount, setUploadingCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [, startTransition] = useTransition();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function uploadOne(file: File) {
    if (!ALLOWED_EXT.test(file.name) && !file.type.startsWith("image/")) {
      toast.error(`${file.name}: 이미지(PNG/JPG/WEBP/GIF)만 첨부할 수 있어요`);
      return;
    }
    setUploadingCount((c) => c + 1);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mentoringId", mentoringId);
      fd.append("tag", tag);
      const res = await fetch("/api/upload/mentoring", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "업로드 실패");

      await attachMentoringPhoto(mentoringId, {
        url: data.url,
        mimeType: data.mimeType,
        tag,
        fileName: data.fileName ?? null,
        sizeBytes: data.sizeBytes ?? null,
      });
      toast.success(`${label} 추가됨`);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploadingCount((c) => c - 1);
    }
  }

  async function handleFiles(files: File[]) {
    for (const f of files) {
      await uploadOne(f);
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length > 0) void handleFiles(files);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) void handleFiles(files);
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await deleteMentoringPhoto(id);
      toast.success("삭제됨");
      setDeleteId(null);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setDeleting(false);
    }
  }

  const busy = uploadingCount > 0;

  return (
    <div>
      <div className="mb-x2 flex items-start justify-between gap-x2">
        <div>
          <h4 className="t4-bold text-fg-neutral">{label}</h4>
          <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">{hint}</p>
        </div>
        <span className="shrink-0 t3-regular tabular-nums text-fg-neutral-subtle">
          {photos.length}장{busy ? ` · 업로드 중…` : ""}
        </span>
      </div>

      {(photos.length > 0 || busy) && (
        <ul className="mb-x3 grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-x2">
          {photos.map((p) => (
            <li
              key={p.id}
              className="group relative aspect-square overflow-hidden rounded-r2 bg-bg-neutral-weak"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.thumbnailUrl ?? p.url}
                alt={p.fileName ?? "첨부"}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => setDeleteId(p.id)}
                aria-label="첨부 삭제"
                className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-bg-overlay text-palette-static-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" strokeWidth={2.5} />
              </button>
            </li>
          ))}
          {Array.from({ length: uploadingCount }).map((_, i) => (
            <li
              key={`u-${i}`}
              className="flex aspect-square items-center justify-center rounded-r2 border border-dashed border-stroke-neutral-weak bg-bg-layer-fill text-fg-neutral-subtle"
            >
              <Loader2 className="size-5 animate-spin" aria-label="업로드 중" />
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer items-center justify-center gap-x1_5 rounded-r2 border border-dashed px-x3 py-x4 t3-medium transition-colors",
          dragOver
            ? "border-stroke-neutral-contrast bg-bg-neutral-weak text-fg-neutral"
            : "border-stroke-neutral-weak bg-bg-layer-fill text-fg-neutral-muted",
          busy ? "pointer-events-none opacity-60" : "hover:bg-bg-neutral-weak"
        )}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ImagePlus className="size-4" aria-hidden />
        )}
        <span>드래그해서 올리거나 눌러서 사진 추가</span>
        <input
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          onChange={handleInput}
          disabled={busy}
          className="hidden"
        />
      </label>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(v) => { if (!v) setDeleteId(null); }}
        title="사진 삭제"
        description="이 사진을 삭제할까요? 삭제한 사진은 되돌릴 수 없어요."
        pending={deleting}
        onConfirm={() => deleteId && handleDelete(deleteId)}
      />
    </div>
  );
}
