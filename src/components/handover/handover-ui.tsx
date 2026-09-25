// 인수인계·투두 화면 공용 프리미티브 (SEED 토큰 기반).
// 훅을 쓰지 않으므로 서버/클라이언트 컴포넌트 양쪽에서 import 가능.

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { StatusBadge, type Tone } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

// ─── 근무 타임(오픈/마감/공통) ────────────────────────────────────────

export const SHIFT_LABEL: Record<string, string> = { OPEN: "오픈", CLOSE: "마감", ALL: "공통" };
export const SHIFT_TONE: Record<string, Tone> = { OPEN: "info", CLOSE: "violet", ALL: "gray" };

export function ShiftBadge({ shiftType, className }: { shiftType: string; className?: string }) {
  return (
    <StatusBadge tone={SHIFT_TONE[shiftType] ?? "gray"} className={className}>
      {SHIFT_LABEL[shiftType] ?? shiftType}
    </StatusBadge>
  );
}

// ─── 체크 표시 · 체크 행 ─────────────────────────────────────────────

/**
 * SEED Checkbox(square) 모양의 표시 전용 체크 — 행 전체가 버튼일 때 안쪽에 둔다.
 * (버튼 안에 실제 checkbox 를 넣으면 중첩 인터랙티브가 되므로 시각 요소만)
 */
export function CheckMark({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-[18px] shrink-0 place-content-center rounded-r1 transition-colors",
        checked
          ? "bg-bg-neutral-inverted text-fg-neutral-inverted"
          : "bg-bg-layer-default shadow-[inset_0_0_0_1.5px_var(--seed-color-stroke-neutral-weak)]",
        className,
      )}
    >
      {checked && <Check className="size-3.5" strokeWidth={3} />}
    </span>
  );
}

/**
 * 누르면 완료/미완료가 바뀌는 목록 행. 행 전체가 버튼이고, action 은 버튼 밖(오른쪽)에 둔다.
 */
export function CheckRow({
  checked,
  onToggle,
  disabled,
  title,
  description,
  trailing,
  action,
  className,
  wrapperClassName,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  /** 행 오른쪽 보조 버튼(이력 등) — 토글 버튼 밖에 렌더 */
  action?: ReactNode;
  className?: string;
  wrapperClassName?: string;
}) {
  return (
    <div className={cn("flex items-stretch", wrapperClassName)}>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={checked}
        className={cn(
          "flex min-w-0 flex-1 items-start gap-x3 px-x5 py-x3 text-left transition-colors hover:bg-bg-layer-default-pressed disabled:cursor-wait",
          className,
        )}
      >
        <CheckMark checked={checked} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className={cn("break-words t4-medium", checked ? "text-fg-neutral-subtle line-through" : "text-fg-neutral")}>
            {title}
          </div>
          {description != null && <div className="mt-x0_5 t3-regular text-fg-neutral-subtle">{description}</div>}
        </div>
        {trailing != null && <div className="flex shrink-0 items-center gap-x1_5 self-center">{trailing}</div>}
      </button>
      {action != null && <div className="flex shrink-0 items-center pr-x3">{action}</div>}
    </div>
  );
}

// ─── 텍스트 도우미 ───────────────────────────────────────────────────

/** Markdown 서식(**, *, #, -)을 제거한 평문 미리보기 (최대 max 글자) */
export function stripMarkdownPreview(src: string, max = 140): string {
  const flat = src
    .replace(/```[\s\S]*?```/g, " ")          // 코드 블록
    .replace(/`[^`]*`/g, " ")                  // 인라인 코드
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")    // 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")  // 링크
    .replace(/^#{1,6}\s+/gm, "")              // 헤더
    .replace(/^[-*+]\s+/gm, "• ")             // 리스트
    .replace(/\*\*([^*]+)\*\*/g, "$1")        // bold
    .replace(/\*([^*]+)\*/g, "$1")            // italic
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}
