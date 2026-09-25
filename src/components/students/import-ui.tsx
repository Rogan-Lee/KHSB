"use client";

// 원생·성적 가져오기(CSV / 구글 시트) 화면이 함께 쓰는 조각들 — SEED 토큰만 사용.

import { useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check, ChevronDown, Upload } from "lucide-react";
import { Notice } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

// ─── 단계 표시 ───────────────────────────────────────────────────────

/** 1 → 2 → 3 단계 안내. current 는 0부터, steps.length 이상이면 모두 완료 */
export function ImportSteps({
  steps,
  current,
  className,
}: {
  steps: { title: string; description?: string }[];
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn("grid grid-cols-1 gap-x3 sm:grid-cols-3", className)}>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.title} className="flex items-start gap-x3">
            <span
              aria-hidden
              className={cn(
                "grid size-x6 shrink-0 place-items-center rounded-full t2-bold tabular-nums",
                active
                  ? "bg-bg-brand-solid text-palette-static-white"
                  : done
                    ? "bg-bg-neutral-inverted text-fg-neutral-inverted"
                    : "bg-bg-neutral-weak text-fg-neutral-subtle",
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <div className="min-w-0">
              <p
                className={cn("t4-bold", active || done ? "text-fg-neutral" : "text-fg-neutral-subtle")}
                aria-current={active ? "step" : undefined}
              >
                {s.title}
              </p>
              {s.description && <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">{s.description}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── 파일 끌어 놓기 ───────────────────────────────────────────────────

export function FileDropZone({
  onFile,
  accept = ".csv",
  title = "CSV 파일을 끌어 놓거나 눌러서 선택하세요",
  hint = "UTF-8 또는 CP949 인코딩 CSV 지원",
}: {
  onFile: (file: File) => void;
  accept?: string;
  title?: string;
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => fileRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fileRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-r4 border-2 border-dashed px-x6 py-x10 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring",
        over
          ? "border-stroke-brand-solid bg-bg-brand-weak"
          : "border-stroke-neutral-weak bg-bg-layer-fill hover:bg-bg-neutral-weak",
      )}
    >
      <span
        aria-hidden
        className="mb-x3 grid size-x12 place-items-center rounded-full bg-bg-layer-default text-fg-neutral-muted"
      >
        <Upload className="size-5" />
      </span>
      <p className="t4-bold text-fg-neutral">{title}</p>
      <p className="mt-x1 t3-regular text-fg-neutral-subtle">{hint}</p>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

// ─── 컬럼 형식 안내 ──────────────────────────────────────────────────

/** 헤더 이름 → 설명 목록 + 참고 문구 */
export function ColumnGuide({
  columns,
  notes,
}: {
  columns: { name: string; description: ReactNode; required?: boolean }[];
  notes?: ReactNode[];
}) {
  return (
    <div className="flex flex-col gap-x4">
      <dl className="grid grid-cols-1 gap-x-x6 gap-y-x2_5 sm:grid-cols-2">
        {columns.map((c) => (
          <div key={c.name} className="flex min-w-0 items-baseline gap-x2">
            <dt className="shrink-0">
              <ColumnName>{c.name}</ColumnName>
            </dt>
            <dd className="min-w-0 t3-regular text-fg-neutral-muted">
              {c.required && <span className="mr-x1 t3-medium text-fg-brand">필수</span>}
              {c.description}
            </dd>
          </div>
        ))}
      </dl>
      {notes && notes.length > 0 && (
        <ul className="flex flex-col gap-x1 border-t border-stroke-neutral-muted pt-x4">
          {notes.map((n, i) => (
            <li key={i} className="flex gap-x2 t3-regular text-fg-neutral-muted">
              <span aria-hidden className="text-fg-neutral-subtle">
                ·
              </span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 헤더 이름 표기 (코드 느낌의 회색 칩) */
export function ColumnName({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-r1 bg-bg-neutral-weak px-x1_5 py-x0_5 t3-medium text-fg-neutral">
      {children}
    </span>
  );
}

/** 접히는 컬럼 안내 (구글 시트 탭) */
export function CollapsibleGuide({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-r3 border border-stroke-neutral-muted">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-x3 rounded-r3 px-x4 py-x3 text-left t4-medium text-fg-neutral transition-colors hover:bg-bg-layer-default-pressed"
      >
        {title}
        <ChevronDown
          className={cn("size-4 text-fg-neutral-subtle transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && <div className="border-t border-stroke-neutral-muted px-x4 py-x4">{children}</div>}
    </div>
  );
}

// ─── 결과 ────────────────────────────────────────────────────────────

/** 행별 오류 목록 */
export function ImportErrors({ errors }: { errors: { row: number; name: string; reason: string }[] }) {
  if (errors.length === 0) return null;
  return (
    <Notice tone="bad" icon={AlertCircle} title={`${errors.length}건 오류`}>
      <span className="flex flex-col gap-x0_5">
        {errors.map((e, i) => (
          <span key={i}>
            {e.row}행 ({e.name}): {e.reason}
          </span>
        ))}
      </span>
    </Notice>
  );
}

// ─── 미리보기 표 ─────────────────────────────────────────────────────
// 세로 스크롤 + 고정 머리칸이 필요해 ui/table 대신 같은 모양의 네이티브 표를 쓴다.

export function PreviewTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("max-h-80 overflow-auto rounded-r3 border border-stroke-neutral-muted", className)}>
      <table className="w-full border-collapse t3-regular text-fg-neutral tabular-nums">{children}</table>
    </div>
  );
}

export const PREVIEW_TH =
  "sticky top-0 z-[1] whitespace-nowrap border-b border-stroke-neutral-muted bg-bg-layer-fill px-x3 py-x2 text-left t3-medium text-fg-neutral-subtle";
export const PREVIEW_TD = "whitespace-nowrap border-b border-stroke-neutral-muted px-x3 py-x2";
