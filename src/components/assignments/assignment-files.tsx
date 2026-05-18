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
import type { AssignmentFile } from "@/generated/prisma";

const MAX_FILES = 5;
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
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: 20MB 초과`);
        continue;
      }
      const ext = getExtension(file.name);
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        toast.error(`${file.name}: 허용되지 않은 형식 (PDF/PNG/JPG/HWP/DOCX)`);
        continue;
      }

      setUploadingCount((c) => c + 1);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("assignmentId", assignmentId);
        const res = await fetch("/api/upload/assignment", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "업로드 실패");

        const attached = await attachFileToAssignment(assignmentId, {
          url: data.url,
          fileName: data.fileName,
          mimeType: data.mimeType,
          sizeBytes: data.sizeBytes,
        });
        setFiles((prev) => [...prev, attached]);
        toast.success(`${data.fileName} 첨부 완료`);
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

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`"${name}" 파일을 삭제할까요?`)) return;
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
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Paperclip className="h-3.5 w-3.5" />
        첨부 파일 ({files.length}/{MAX_FILES})
      </div>

      {/* 파일 목록 */}
      {loaded && files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                download={f.fileName}
                className="flex-1 min-w-0 text-xs hover:underline truncate"
                title={f.fileName}
              >
                {f.fileName}
              </a>
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                {formatBytes(f.sizeBytes)}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(f.id, f.fileName)}
                disabled={isPending}
                className="shrink-0 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                aria-label="파일 삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {Array.from({ length: uploadingCount }).map((_, i) => (
            <li
              key={`u-${i}`}
              className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              업로드 중...
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
            "flex flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-3 text-xs cursor-pointer transition-colors",
            dragActive
              ? "border-primary bg-primary/5 text-primary"
              : "border-muted-foreground/30 text-muted-foreground hover:bg-accent/40",
            busy && "pointer-events-none opacity-60"
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          <span className="font-medium">
            파일 끌어다 놓기 또는 클릭해 업로드
          </span>
          <span className="text-[10px] text-muted-foreground">
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
    </div>
  );
}

