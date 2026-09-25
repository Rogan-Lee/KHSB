// 입퇴실 상태 → SEED 역할색 매핑(단일 정의). 표·요약·보드가 모두 이 표를 쓴다.
// 훅이 없으므로 서버/클라이언트 컴포넌트 양쪽에서 import 가능.
//
//   정상 → positive · 지각 → warning · 결석 → critical · 외출 중 → informative
//   미입실(사전 통보) → purple(분류용) · 공결/자율/비등원일 → neutral
//
// 행 배경은 좌측 sticky 셀에도 같은 값을 깔기 때문에 불투명 토큰만 쓴다(SEED *-weak 는 불투명 팔레트).

import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge, type Tone } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

export type AttendanceStateKey =
  | "NORMAL"
  | "TARDY"
  | "OUTING"
  | "NOTIFIED_ABSENT"
  | "ABSENT"
  | "APPROVED_ABSENT"
  | "FLEXIBLE"
  | "UNRECORDED"
  | "NO_SCHEDULE";

type StateMeta = {
  label: string;
  tone: Tone;
  /** 표 행 배경(불투명) + group-hover 한 단계 진하게 */
  row: string;
};

export const ATTENDANCE_STATE: Record<AttendanceStateKey, StateMeta> = {
  NORMAL: { label: "정상", tone: "ok", row: "bg-bg-positive-weak group-hover:bg-bg-positive-weak-pressed" },
  TARDY: { label: "지각", tone: "warn", row: "bg-bg-warning-weak group-hover:bg-bg-warning-weak-pressed" },
  OUTING: { label: "외출 중", tone: "info", row: "bg-bg-informative-weak group-hover:bg-bg-informative-weak-pressed" },
  NOTIFIED_ABSENT: { label: "미입실", tone: "violet", row: "bg-palette-purple-100 group-hover:bg-palette-purple-200" },
  ABSENT: { label: "결석", tone: "bad", row: "bg-bg-critical-weak group-hover:bg-bg-critical-weak-pressed" },
  APPROVED_ABSENT: { label: "공결", tone: "gray", row: "bg-bg-neutral-weak group-hover:bg-bg-neutral-weak-pressed" },
  FLEXIBLE: { label: "자율(미정)", tone: "gray", row: "bg-bg-layer-fill group-hover:bg-bg-neutral-weak" },
  UNRECORDED: { label: "미기록", tone: "warn", row: "bg-bg-warning-weak group-hover:bg-bg-warning-weak-pressed" },
  NO_SCHEDULE: { label: "비등원일", tone: "gray", row: "bg-bg-layer-default group-hover:bg-bg-layer-default-pressed" },
};

export function attendanceStateMeta(state: string): StateMeta {
  return ATTENDANCE_STATE[state as AttendanceStateKey] ?? ATTENDANCE_STATE.NO_SCHEDULE;
}

/** 출결 상태 배지 — SEED Badge(weak). 미입실(보라)만 분류용 팔레트로 덧칠 */
export function AttendanceStateBadge({
  state,
  label,
  size = "medium",
  className,
}: {
  state: string;
  /** 기본 라벨 대신 쓸 문구 */
  label?: ReactNode;
  size?: "medium" | "large";
  className?: string;
}) {
  const meta = attendanceStateMeta(state);
  return (
    <StatusBadge
      tone={meta.tone}
      size={size}
      className={cn(meta.tone === "violet" && "bg-palette-purple-100 text-palette-purple-700", className)}
    >
      {label ?? meta.label}
    </StatusBadge>
  );
}

/** 입퇴실 활동 역할색 — 입실 positive · 외출/복귀 informative · 퇴실 neutral */
export const ACTIVITY_TONE = {
  checkIn: "ok",
  outing: "info",
  checkOut: "gray",
} as const satisfies Record<string, Tone>;

/**
 * URL(searchParams) 필터 칩 — FilterChip(SEED Chip outlineStrong · small)의 Link 버전.
 * 서버 컴포넌트에서 쓰기 위해 Link 로 렌더한다.
 */
export function FilterLink({
  href,
  selected = false,
  count,
  title,
  children,
}: {
  href: string;
  selected?: boolean;
  count?: number;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-x1 rounded-full px-x3_5 t4-medium transition-colors",
        selected
          ? "bg-bg-neutral-inverted text-fg-neutral-inverted"
          : "bg-bg-layer-default text-fg-neutral-muted shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed",
      )}
    >
      {children}
      {count != null && (
        <span className={cn("tabular-nums", selected ? "text-fg-neutral-inverted/70" : "text-fg-neutral-subtle")}>
          {count}
        </span>
      )}
    </Link>
  );
}
