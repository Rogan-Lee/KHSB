"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import {
  attachFileToAssignment,
  deleteAssignmentFile,
  listAssignmentFiles,
} from "@/actions/assignments";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/exams/use-confirm-dialog";
import type { AssignmentFile } from "@/generated/prisma";

// 파일 행·업로드 영역 공통 스타일 (SEED)
const FILE_ROW =
  "flex items-center gap-x2 rounded-r2 border border-stroke-neutral-muted bg-bg-layer-default py-x1_5 pl-x3 pr-x1";
const DROP_ZONE =
  "flex cursor-pointer flex-col items-center justify-center gap-x1 rounded-r3 border border-dashed px-x3 py-x4 text-center transition-colors";

function FilesHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-x1_5 t3-medium text-fg-neutral-muted">
      <Paperclip className="size-3.5" aria-hidden />
      첨부 파일
      <span className="tabular-nums text-fg-neutral-subtle">
        {count}/{MAX_FILES}
      </span>
    </div>
  );
}

export const MAX_FILES = 5;
const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "hwp", "docx"];
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.hwp,.docx";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getExtension(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "";
}

/** 첨부 가능 여부 검증 — 통과 시 null, 실패 시 한국어 에러 메시지 반환. */
export function validateFile(file: File): string | null {
  if (file.size > MAX_BYTES) return `${file.name}: 20MB 초과`;
  const ext = getExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `${file.name}: 허용되지 않은 형식 (PDF/PNG/JPG/HWP/DOCX)`;
  }
  return null;
}

/** 단일 파일을 업로드(Vercel Blob)하고 과제에 첨부(DB)한 뒤 레코드를 반환. */
export async function uploadAssignmentFile(
  assignmentId: string,
  file: File,
): Promise<AssignmentFile> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("assignmentId", assignmentId);
  const res = await fetch("/api/upload/assignment", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "업로드 실패");
  return attachFileToAssignment(assignmentId, {
    url: data.url,
    fileName: data.fileName,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
  });
}

/**
 * 과제 첨부 파일 업로드/목록/삭제 UI (Sprint 4 PR 4.2).
 * - 신규 과제는 먼저 저장된 후(=assignmentId 발급 후)에만 첨부 가능.
 * - POST /api/upload/assignment 로 업로드 → attachFileToAssignment 로 DB 연결.
 */
export function AssignmentFiles({ assignmentId }: { assignmentId: string }) {
  const [files, setFiles] = useState<AssignmentFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [dragActive, setDragActive] = useState(false);
  const inputId = useId();
  const [confirm, confirmDialog] = useConfirmDialog();

  useEffect(() => {
    let cancelled = false;
    listAssignmentFiles(assignmentId)
      .then((rows) => {
        if (!cancelled) {
          setFiles(rows);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  async function uploadFiles(picked: File[]) {
    const room = MAX_FILES - files.length - uploadingCount;
    if (room <= 0) {
      toast.error(`최대 ${MAX_FILES}개까지 첨부할 수 있어요`);
      return;
    }
    const slice = picked.slice(0, room);
    if (slice.length < picked.length) {
      toast.error(`최대 ${MAX_FILES}개까지 — ${slice.length}개만 추가했어요`);
    }

    for (const file of slice) {
      const err = validateFile(file);
      if (err) {
        toast.error(err);
        continue;
      }

      setUploadingCount((c) => c + 1);
      try {
        const attached = await uploadAssignmentFile(assignmentId, file);
        setFiles((prev) => [...prev, attached]);
        toast.success(`${attached.fileName} 첨부 완료`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "업로드 실패");
      } finally {
        setUploadingCount((c) => c - 1);
      }
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length > 0) void uploadFiles(picked);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragActive(false);
    const picked = Array.from(e.dataTransfer.files ?? []);
    if (picked.length > 0) void uploadFiles(picked);
  }

  async function handleDelete(id: string, name: string) {
    const ok = await confirm({
      title: `"${name}" 파일을 삭제할까요?`,
      description: "삭제하면 되돌릴 수 없어요.",
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await deleteAssignmentFile(id);
        setFiles((prev) => prev.filter((f) => f.id !== id));
        toast.success("파일이 삭제되었습니다");
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  const full = files.length + uploadingCount >= MAX_FILES;
  const busy = uploadingCount > 0;

  return (
    <div className="flex flex-col gap-x2">
      <FilesHeader count={files.length} />

      {/* 파일 목록 */}
      {loaded && files.length > 0 && (
        <ul className="flex flex-col gap-x1_5">
          {files.map((f) => (
            <li key={f.id} className={FILE_ROW}>
              <FileText className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                download={f.fileName}
                className="min-w-0 flex-1 truncate t3-regular text-fg-neutral hover:underline"
                title={f.fileName}
              >
                {f.fileName}
              </a>
              <span className="shrink-0 t2-regular tabular-nums text-fg-neutral-subtle">
                {formatBytes(f.sizeBytes)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(f.id, f.fileName)}
                disabled={isPending}
                className="size-x7 text-fg-neutral-subtle hover:text-fg-critical"
                aria-label={`${f.fileName} 삭제`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
          {Array.from({ length: uploadingCount }).map((_, i) => (
            <li
              key={`u-${i}`}
              className="flex items-center gap-x2 rounded-r2 border border-dashed border-stroke-neutral-weak bg-bg-layer-fill px-x3 py-x2 t3-regular text-fg-neutral-subtle"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden />
              업로드 중…
            </li>
          ))}
        </ul>
      )}

      {/* 업로드 영역 */}
      {!full && (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={cn(
            DROP_ZONE,
            dragActive
              ? "border-stroke-brand-solid bg-bg-brand-weak text-fg-brand"
              : "border-stroke-neutral-weak bg-bg-layer-default text-fg-neutral-muted hover:bg-bg-layer-default-pressed",
            busy && "pointer-events-none opacity-60"
          )}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <Upload className="size-5" aria-hidden />
          )}
          <span className="t3-medium">파일을 끌어다 놓거나 눌러서 업로드</span>
          <span className="t2-regular text-fg-neutral-subtle">
            PDF · PNG · JPG · HWP · DOCX · 최대 20MB · {MAX_FILES}개까지
          </span>
          <input
            id={inputId}
            type="file"
            accept={ACCEPT}
            multiple
            onChange={handleInput}
            disabled={busy}
            className="hidden"
          />
        </label>
      )}

      {confirmDialog}
    </div>
  );
}

/**
 * 과제 생성 전(=assignmentId 미발급) 파일을 메모리에 임시 보관하는 picker.
 * 검증만 수행하고 실제 업로드는 과제 저장 후 부모가 uploadAssignmentFile 로 처리.
 */
export function PendingFilePicker({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (next: File[]) => void;
  disabled?: boolean;
}) {
  const [dragActive, setDragActive] = useState(false);
  const inputId = useId();

  function addFiles(picked: File[]) {
    if (files.length >= MAX_FILES) {
      toast.error(`최대 ${MAX_FILES}개까지 첨부할 수 있어요`);
      return;
    }
    const next = [...files];
    for (const file of picked) {
      if (next.length >= MAX_FILES) {
        toast.error(`최대 ${MAX_FILES}개까지 첨부할 수 있어요`);
        break;
      }
      const err = validateFile(file);
      if (err) {
        toast.error(err);
        continue;
      }
      next.push(file);
    }
    if (next.length !== files.length) onChange(next);
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length > 0) addFiles(picked);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragActive(false);
    if (disabled) return;
    const picked = Array.from(e.dataTransfer.files ?? []);
    if (picked.length > 0) addFiles(picked);
  }

  const full = files.length >= MAX_FILES;

  return (
    <div className="flex flex-col gap-x2">
      <FilesHeader count={files.length} />

      {files.length > 0 && (
        <ul className="flex flex-col gap-x1_5">
          {files.map((f, idx) => (
            <li key={`${f.name}-${idx}`} className={FILE_ROW}>
              <FileText className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
              <span className="min-w-0 flex-1 truncate t3-regular text-fg-neutral" title={f.name}>
                {f.name}
              </span>
              <span className="shrink-0 t2-regular tabular-nums text-fg-neutral-subtle">
                {formatBytes(f.size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(files.filter((_, i) => i !== idx))}
                disabled={disabled}
                className="size-x7 text-fg-neutral-subtle hover:text-fg-critical"
                aria-label={`${f.name} 제거`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={cn(
            DROP_ZONE,
            dragActive
              ? "border-stroke-brand-solid bg-bg-brand-weak text-fg-brand"
              : "border-stroke-neutral-weak bg-bg-layer-default text-fg-neutral-muted hover:bg-bg-layer-default-pressed",
            disabled && "pointer-events-none opacity-60"
          )}
        >
          <Upload className="size-5" aria-hidden />
          <span className="t3-medium">파일을 끌어다 놓거나 눌러서 선택</span>
          <span className="t2-regular text-fg-neutral-subtle">
            PDF · PNG · JPG · HWP · DOCX · 최대 20MB · {MAX_FILES}개까지
          </span>
          <input
            id={inputId}
            type="file"
            accept={ACCEPT}
            multiple
            onChange={handleInput}
            disabled={disabled}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}
