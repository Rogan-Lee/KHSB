"use client";

// 수행평가 상태·마감 표기 — 대시보드(performance-panel)와 학생별 목록(performance-task-list)이 같은 문구·색을 쓴다.

import type { ReactNode } from "react";
import { StatusBadge, type Tone } from "@/components/backoffice/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { PerformanceTaskStatus } from "@/generated/prisma";

export const PERF_STATUS_LABEL: Record<PerformanceTaskStatus, string> = {
  OPEN: "진행 전",
  IN_PROGRESS: "진행 중",
  SUBMITTED: "제출 완료",
  NEEDS_REVISION: "수정 필요",
  DONE: "최종 완료",
};

// 제출 완료 = 검토가 필요한 상태(warn), 수정 필요 = 학생 쪽 문제(bad)
export const PERF_STATUS_TONE: Record<PerformanceTaskStatus, Tone> = {
  OPEN: "gray",
  IN_PROGRESS: "info",
  SUBMITTED: "warn",
  NEEDS_REVISION: "bad",
  DONE: "ok",
};

export const PERF_STATUS_ORDER: PerformanceTaskStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "SUBMITTED",
  "NEEDS_REVISION",
  "DONE",
];

// 상태 점 색 (선택 상자 안에서 상태를 빠르게 구분)
const DOT: Record<Tone, string> = {
  gray: "bg-fg-placeholder",
  brand: "bg-fg-brand",
  ok: "bg-fg-positive",
  warn: "bg-fg-warning",
  bad: "bg-fg-critical",
  info: "bg-fg-informative",
  violet: "bg-palette-purple-600",
};

export function PerfStatusBadge({ status }: { status: PerformanceTaskStatus }) {
  return <StatusBadge tone={PERF_STATUS_TONE[status]}>{PERF_STATUS_LABEL[status]}</StatusBadge>;
}

/** 상태 변경 선택 상자 (SEED Select 규격, 작은 크기) */
export function PerfStatusSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: PerformanceTaskStatus;
  onChange: (status: PerformanceTaskStatus) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as PerformanceTaskStatus)} disabled={disabled}>
      <SelectTrigger aria-label="상태 변경" className={cn("h-x8 w-[118px] px-x2_5 t3-medium", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PERF_STATUS_ORDER.map((s) => (
          <SelectItem key={s} value={s}>
            <span className="inline-flex items-center gap-x2">
              <span className={cn("size-1.5 shrink-0 rounded-full", DOT[PERF_STATUS_TONE[s]])} aria-hidden />
              {PERF_STATUS_LABEL[s]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** 마감까지 남은 날 (올림) — now 는 호출부가 한 번 잡아 넘긴다 */
export function daysUntil(dueIso: string, now: number): number {
  return Math.ceil((new Date(dueIso).getTime() - now) / (1000 * 60 * 60 * 24));
}

/** 마감일 + D-day 배지. 완료된 과제는 강조하지 않는다 */
export function DueDate({
  dueIso,
  now,
  done = false,
  className,
}: {
  dueIso: string;
  now: number;
  done?: boolean;
  className?: string;
}) {
  const daysLeft = daysUntil(dueIso, now);
  const tone: Tone = done ? "gray" : daysLeft < 0 ? "bad" : daysLeft <= 3 ? "warn" : "gray";
  const dday: ReactNode =
    daysLeft < 0 ? `D+${-daysLeft}` : daysLeft === 0 ? "D-Day" : `D-${daysLeft}`;
  return (
    <span className={cn("inline-flex items-center gap-x1_5 whitespace-nowrap", className)}>
      <span className="t3-regular tabular-nums text-fg-neutral-muted">
        {new Date(dueIso).toLocaleDateString("ko-KR", {
          month: "numeric",
          day: "numeric",
          weekday: "short",
        })}
      </span>
      <StatusBadge tone={tone}>{dday}</StatusBadge>
    </span>
  );
}
