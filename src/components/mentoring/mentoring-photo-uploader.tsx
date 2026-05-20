"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  attachMentoringPhoto,
  deleteMentoringPhoto,
} from "@/actions/mentoring";
import type { MentoringPhotoTag, MentoringPhoto } from "@/generated/prisma";

const ALLOWED_EXT = /\.(png|jpe?g|webp|gif)$/i;

const ZONES: { tag: MentoringPhotoTag; label: string; hint: string }[] = [
  { tag: "KDA", label: "핵심 자료 (KDA)", hint: "학습 핵심·D·A 자료" },
  { tag: "EXTRA", label: "추가 자료", hint: "보조 풀이/참고 자료" },
  { tag: "FREE", label: "자유 첨부", hint: "기타 자유 첨부" },
];

/**
 * 오프라인 멘토링 기록 KDA / 추가 / 자유 첨부 업로더 (Sprint 5 PR 5.1 이식).
 * `/api/upload/mentoring` 으로 파일 업로드 후
 * `attachMentoringPhoto` 서버 액션으로 DB 기록.
 */
export function MentoringPhotoUploader({
  mentoringId,
  existing,
}: {
  mentoringId: string;
  existing: MentoringPhoto[];
}) {
  return (
    <div className="space-y-4">
      {ZONES.map((zone) => (
        <ZoneBlock
          key={zone.tag}
          mentoringId={mentoringId}
          tag={zone.tag}
          label={zone.label}
          hint={zone.hint}
          photos={existing.filter((p) => p.tag === zone.tag)}
        />
      ))}
    </div>
  );
}

function ZoneBlock({
  mentoringId,
  tag,
  label,
  hint,
  photos,
}: {
  mentoringId: string;
  tag: MentoringPhotoTag;
  label: string;
  hint: string;
  photos: MentoringPhoto[];
}) {
  const router = useRouter();
  const inputId = useId();
  const [uploadingCount, setUploadingCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [, startTransition] = useTransition();

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
    if (!confirm("이 사진을 삭제할까요?")) return;
    try {
      await deleteMentoringPhoto(id);
      toast.success("삭제됨");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  const busy = uploadingCount > 0;

  return (
    <div className="rounded-[10px] border border-line bg-panel p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h6 className="text-[12.5px] font-semibold text-ink">{label}</h6>
          <p className="text-[11px] text-ink-4">{hint}</p>
        </div>
        <span className="text-[11px] text-ink-5">
          {photos.length}장{busy ? ` · 업로드 중…` : ""}
        </span>
      </div>

      {(photos.length > 0 || busy) && (
        <ul className="mb-2 grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
          {photos.map((p) => (
            <li
              key={p.id}
              className="group relative aspect-square overflow-hidden rounded-[8px] border border-line bg-canvas-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.thumbnailUrl ?? p.url}
                alt={p.caption ?? "첨부"}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                aria-label="첨부 삭제"
                className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-ink/80 text-white group-hover:inline-flex"
              >
                <Trash2 className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </li>
          ))}
          {Array.from({ length: uploadingCount }).map((_, i) => (
            <li
              key={`u-${i}`}
              className="flex aspect-square items-center justify-center rounded-[8px] border border-dashed border-line bg-canvas-2 text-ink-4"
            >
              <Loader2 className="h-5 w-5 animate-spin" />
            </li>
          ))}
        </ul>
      )}

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-dashed px-3 py-3 text-[12px] transition-colors ${
          dragOver
            ? "border-line-strong bg-canvas-2 text-ink"
            : "border-line bg-canvas text-ink-3"
        } ${busy ? "pointer-events-none opacity-60" : "hover:bg-canvas-2"}`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImagePlus className="h-4 w-4" />
        )}
        <span>드래그해서 올리거나 클릭해서 사진 추가</span>
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
    </div>
  );
}
