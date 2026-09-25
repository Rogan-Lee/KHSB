// 학생 포털(매직링크) 전용 UI 프리미티브 — SEED Design(당근) 컴포넌트·토큰 기반.
//  · 버튼/배지/콜아웃/칩/세그먼트/스켈레톤은 SEED 컴포넌트(src/seed-design/ui, @seed-design/react) 그대로 사용
//  · SEED React 에 웹 대응 컴포넌트가 없는 카드·리스트 행·아이콘 타일은 SEED 토큰·타이포로 구성
// 훅을 쓰지 않으므로 서버/클라이언트 컴포넌트 양쪽에서 import 가능. 바텀시트는 ./bottom-sheet.tsx.

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Badge as SeedBadge, Skeleton as SeedSkeleton } from "@seed-design/react";
import { actionButton } from "@seed-design/css/recipes/action-button";
import { ActionButton } from "seed-design/ui/action-button";
import { Callout } from "seed-design/ui/callout";
import { Chip as SeedChip } from "seed-design/ui/chip";
import { SegmentedControl, SegmentedControlItem } from "seed-design/ui/segmented-control";
import { cn } from "@/lib/utils";

// ─── Tone → SEED role ────────────────────────────────────────────────

export type Tone = "gray" | "brand" | "ok" | "warn" | "bad" | "info" | "violet";

type SeedTone = "neutral" | "brand" | "positive" | "warning" | "critical" | "informative";

const SEED_TONE: Record<Tone, SeedTone> = {
  gray: "neutral",
  brand: "brand",
  ok: "positive",
  warn: "warning",
  bad: "critical",
  info: "informative",
  violet: "informative",
};

/** 약한 배경 + 역할 전경색 (SEED bg.*-weak / fg.*) */
export const TONE_SOFT: Record<Tone, string> = {
  gray: "bg-bg-neutral-weak text-fg-neutral-muted",
  brand: "bg-bg-brand-weak text-fg-brand",
  ok: "bg-bg-positive-weak text-fg-positive",
  warn: "bg-bg-warning-weak text-fg-warning",
  bad: "bg-bg-critical-weak text-fg-critical",
  info: "bg-bg-informative-weak text-fg-informative",
  violet: "bg-palette-purple-100 text-palette-purple-700",
};

/** 강한 배경 (SEED bg.*-solid) */
export const TONE_SOLID: Record<Tone, string> = {
  gray: "bg-bg-neutral-solid text-fg-neutral-inverted",
  brand: "bg-bg-brand-solid text-palette-static-white",
  ok: "bg-bg-positive-solid text-palette-static-white",
  warn: "bg-bg-warning-solid text-fg-neutral",
  bad: "bg-bg-critical-solid text-palette-static-white",
  info: "bg-bg-informative-solid text-palette-static-white",
  violet: "bg-palette-purple-600 text-palette-static-white",
};

/** 눌림 피드백 — SEED Scale Feedback 과 같은 감각 */
export const PRESS =
  "transition-[transform,background-color,opacity] duration-pressed-scale ease-out active:scale-[0.98]";

// ─── Badge ───────────────────────────────────────────────────────────

export function Badge({
  tone = "gray",
  solid = false,
  size = "sm",
  className,
  children,
}: {
  tone?: Tone;
  solid?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
  children: ReactNode;
}) {
  return (
    <SeedBadge
      tone={SEED_TONE[tone]}
      variant={solid ? "solid" : "weak"}
      size={size === "md" ? "large" : "medium"}
      className={cn("shrink-0 tabular-nums", className)}
    >
      {children}
    </SeedBadge>
  );
}

/** 탭바/리스트용 숫자 알림 배지 */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-bg-brand-solid px-[5px] t1-bold text-palette-static-white tabular-nums",
        className
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ─── Icon tile ───────────────────────────────────────────────────────

const TILE_SIZE = {
  32: { box: "size-x8 rounded-r2_5", icon: "h-4 w-4" },
  40: { box: "size-x10 rounded-r3", icon: "h-5 w-5" },
  44: { box: "h-11 w-11 rounded-r3_5", icon: "h-[22px] w-[22px]" },
  48: { box: "size-x12 rounded-r4", icon: "h-6 w-6" },
  56: { box: "size-x14 rounded-r5", icon: "h-7 w-7" },
  64: { box: "size-x16 rounded-r5", icon: "h-8 w-8" },
} as const;

export function IconTile({
  icon: Icon,
  tone = "gray",
  solid = false,
  size = 40,
  round = false,
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  solid?: boolean;
  size?: keyof typeof TILE_SIZE;
  round?: boolean;
  className?: string;
}) {
  const s = TILE_SIZE[size];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        s.box,
        round && "rounded-full",
        solid ? TONE_SOLID[tone] : TONE_SOFT[tone],
        className
      )}
      aria-hidden
    >
      <Icon className={s.icon} strokeWidth={2.2} />
    </span>
  );
}

// ─── Avatar (이니셜) ─────────────────────────────────────────────────
// SEED Avatar 는 이미지 기반(없으면 실루엣)이라, 이름 이니셜이 필요한 곳은 SEED 팔레트로 직접 그린다.

const AVATAR_TONES = [
  "bg-palette-carrot-500",
  "bg-palette-green-600",
  "bg-palette-blue-600",
  "bg-palette-purple-600",
  "bg-palette-yellow-600",
  "bg-palette-red-500",
] as const;

export function avatarTone(name: string): string {
  const code = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_TONES[code % AVATAR_TONES.length];
}

const AVATAR_SIZE = {
  32: "size-x8 t3-bold",
  40: "size-x10 t4-bold",
  48: "size-x12 t6-bold",
  56: "size-x14 t7-bold",
} as const;

export function Avatar({
  name,
  size = 40,
  muted = false,
  className,
}: {
  name: string;
  size?: keyof typeof AVATAR_SIZE;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-palette-static-white",
        AVATAR_SIZE[size],
        avatarTone(name),
        muted && "opacity-50 grayscale-[40%]",
        className
      )}
      aria-hidden
    >
      {name.slice(0, 1)}
    </span>
  );
}

// ─── Section (흰 라운드 카드) ─────────────────────────────────────────

export function Section({
  title,
  description,
  action,
  flush = false,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** true 면 본문 패딩 없이 ListRow 를 바로 배치 */
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const hasHeader = title != null || action != null;
  return (
    <section className={cn("rounded-r5 bg-bg-layer-default", className)}>
      {hasHeader && (
        <header
          className={cn(
            "flex items-center justify-between gap-x3 px-x5 pt-x5",
            flush ? "pb-x1" : "pb-x3"
          )}
        >
          <div className="min-w-0">
            {title != null && <h2 className="t6-bold text-fg-neutral">{title}</h2>}
            {description != null && (
              <p className="mt-x0_5 t4-regular text-fg-neutral-subtle">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      {children != null &&
        (flush ? (
          <div className={cn("pb-x2", !hasHeader && "pt-x2")}>{children}</div>
        ) : (
          <div className={cn("px-x5 pb-x5", !hasHeader && "pt-x5")}>{children}</div>
        ))}
    </section>
  );
}

/** 섹션 헤더 우측의 "전체 >" 텍스트 링크 */
export function SectionAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-mr-1.5 inline-flex shrink-0 items-center rounded-r2 px-x1_5 py-x1 t4-medium text-fg-neutral-subtle transition-colors active:bg-bg-transparent-pressed"
    >
      {children}
      <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
    </Link>
  );
}

/** 카드 밖 소제목 (날짜 그룹 등) */
export function GroupLabel({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-x1 pb-x2 pt-x1">
      <p className="t4-bold text-fg-neutral-muted">{children}</p>
      {trailing != null && <span className="t3-regular text-fg-neutral-subtle tabular-nums">{trailing}</span>}
    </div>
  );
}

// ─── List row ────────────────────────────────────────────────────────
// SEED List Item 규격(prefix · title t5 · detail t4 subtle · suffix)을 따르되,
// 카드 안에서 쓰기 위해 눌림 영역을 둥글게 인셋한다.

export function ListRow({
  href,
  external = false,
  onClick,
  leading,
  title,
  description,
  meta,
  trailing,
  chevron,
  muted = false,
  className,
}: {
  href?: string;
  external?: boolean;
  onClick?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** 제목 위 작은 라벨 줄 (배지 등) */
  meta?: ReactNode;
  trailing?: ReactNode;
  /** 기본값: 링크/버튼이면 true */
  chevron?: boolean;
  muted?: boolean;
  className?: string;
}) {
  const interactive = !!href || !!onClick;
  const showChevron = chevron ?? interactive;
  const body = (
    <>
      {leading}
      <div className="flex min-w-0 flex-1 flex-col gap-x0_5">
        {meta != null && <div className="mb-x0_5 flex flex-wrap items-center gap-x1">{meta}</div>}
        <div className={cn("t5-medium", muted ? "text-fg-neutral-subtle" : "text-fg-neutral")}>
          {title}
        </div>
        {description != null && (
          <div className="t4-regular text-fg-neutral-subtle">{description}</div>
        )}
      </div>
      {trailing != null && (
        <div className="flex shrink-0 items-center gap-x1_5 t4-regular text-fg-neutral-subtle">
          {trailing}
        </div>
      )}
      {showChevron && (
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-fg-neutral-subtle" strokeWidth={2} aria-hidden />
      )}
    </>
  );
  const cls = cn(
    "mx-x2 flex items-center gap-x3 rounded-r4 px-x3 py-x3 text-left",
    interactive &&
      "w-[calc(100%-16px)] transition-colors duration-color-transition active:bg-bg-transparent-pressed",
    className
  );
  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noopener" className={cls}>
        {body}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** 라벨 — 값 형태의 정보 줄 (상세 화면용) */
export function InfoRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-x4 py-x2">
      <span className="shrink-0 t5-regular text-fg-neutral-subtle">{label}</span>
      <span className="min-w-0 text-right t5-medium text-fg-neutral">{children}</span>
    </div>
  );
}

const STAT_TONE = {
  neutral: "text-fg-neutral",
  brand: "text-fg-brand",
  positive: "text-fg-positive",
  warning: "text-fg-warning",
  critical: "text-fg-critical",
  informative: "text-fg-informative",
} as const;

/**
 * 요약 숫자 칸(2~4열) — 라벨 위, 값 아래, 칸 사이 세로 구분선.
 * surface="fill" 은 흰 카드 안 회색 블록, "plain" 은 배경 없음(Section 안에 바로).
 */
export function StatGrid({
  items,
  surface = "fill",
  className,
}: {
  items: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: keyof typeof STAT_TONE }[];
  surface?: "fill" | "plain";
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid divide-x divide-stroke-neutral-subtle",
        surface === "fill" && "rounded-r4 bg-bg-layer-fill py-x4",
        className
      )}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((it, i) => (
        <div key={i} className="flex min-w-0 flex-col items-center gap-x1 px-x2 text-center">
          <dt className="t3-regular text-fg-neutral-subtle">{it.label}</dt>
          <dd className={cn("t6-bold tabular-nums", STAT_TONE[it.tone ?? "neutral"])}>{it.value}</dd>
          {it.sub != null && <dd className="t2-regular text-fg-neutral-subtle">{it.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

// ─── Buttons (SEED ActionButton) ─────────────────────────────────────

export type ButtonVariant = "primary" | "weak" | "gray" | "dark" | "danger" | "ghost";
export type ButtonSize = "xl" | "lg" | "md" | "sm" | "xs";

type SeedButtonVariant =
  | "brandSolid"
  | "neutralSolid"
  | "neutralWeak"
  | "criticalSolid"
  | "brandOutline"
  | "neutralOutline"
  | "ghost";

const SEED_VARIANT: Record<ButtonVariant, SeedButtonVariant> = {
  primary: "brandSolid",
  weak: "neutralWeak",
  gray: "neutralWeak",
  dark: "neutralSolid",
  danger: "criticalSolid",
  ghost: "ghost",
};

const SEED_SIZE: Record<ButtonSize, "xsmall" | "small" | "medium" | "large"> = {
  xl: "large",
  lg: "large",
  md: "medium",
  sm: "small",
  xs: "xsmall",
};

/** 버튼이 아닌 요소(카드 안 span 등)에 SEED ActionButton 모양을 입힐 때 */
export function buttonClass({
  variant = "primary",
  size = "lg",
  block = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}) {
  return cn(
    actionButton({ variant: SEED_VARIANT[variant], size: SEED_SIZE[size], layout: "withText" }),
    block && "w-full",
    className
  );
}

export function Button({
  variant = "primary",
  size = "lg",
  block = false,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
}) {
  return (
    <ActionButton
      type={type}
      variant={SEED_VARIANT[variant]}
      size={SEED_SIZE[size]}
      loading={loading}
      disabled={disabled}
      className={cn(block && "w-full", className)}
      {...rest}
    >
      {children}
    </ActionButton>
  );
}

export function ButtonLink({
  href,
  external = false,
  variant = "primary",
  size = "lg",
  block = false,
  className,
  children,
}: {
  href: string;
  external?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <ActionButton
      asChild
      variant={SEED_VARIANT[variant]}
      size={SEED_SIZE[size]}
      className={cn(block && "w-full", className)}
    >
      {external ? (
        <a href={href} target="_blank" rel="noopener">
          {children}
        </a>
      ) : (
        <Link href={href}>{children}</Link>
      )}
    </ActionButton>
  );
}

/**
 * 화면 하단 고정 CTA. 탭바가 없는 하위 화면에서 사용.
 * 본문이 가려지지 않도록 같은 높이의 spacer 를 함께 렌더한다.
 */
export function BottomCTA({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <>
      <div aria-hidden className={note ? "h-[116px]" : "h-[92px]"} />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
        <div
          className="pointer-events-auto mx-auto max-w-[480px] bg-gradient-to-t from-[var(--portal-surface,var(--seed-color-bg-layer-basement))] from-70% to-transparent px-x4 pt-x6"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
        >
          {note != null && (
            <p className="mb-x2_5 text-center t3-regular text-fg-neutral-subtle">{note}</p>
          )}
          <div className="flex gap-x2 [&>*]:min-w-0">{children}</div>
        </div>
      </div>
    </>
  );
}

// ─── Form ────────────────────────────────────────────────────────────
// 새 코드는 SEED TextField(src/seed-design/ui/text-field) 를 직접 쓴다.
// 아래 클래스는 아직 raw input 을 쓰는 곳을 SEED text-input(outline, large) 모양에 맞춘 것.

export const inputClass =
  "block h-x13 w-full rounded-r3 border border-stroke-neutral-weak bg-bg-layer-default px-x4 t5-regular text-fg-neutral outline-none transition-[border-color,box-shadow] duration-color-transition placeholder:text-fg-placeholder focus:border-stroke-neutral-contrast focus:shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-contrast)] disabled:bg-bg-disabled disabled:text-fg-disabled";

export const textareaClass =
  "block w-full resize-none rounded-r3 border border-stroke-neutral-weak bg-bg-layer-default px-x4 py-x3_5 t5-regular text-fg-neutral outline-none transition-[border-color,box-shadow] duration-color-transition placeholder:text-fg-placeholder focus:border-stroke-neutral-contrast focus:shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-contrast)] disabled:bg-bg-disabled disabled:text-fg-disabled";

export function Field({
  label,
  optional = false,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      {/* SEED Field Label 규격: t5 medium, 보조 표시(indicator)는 t4 regular subtle */}
      <label htmlFor={htmlFor} className="mb-x2 block t5-medium text-fg-neutral">
        {label}
        {optional && <span className="pl-x1 t4-regular text-fg-neutral-subtle">선택</span>}
      </label>
      {children}
      {hint != null && <p className="mt-x1_5 t3-regular text-fg-neutral-subtle">{hint}</p>}
    </div>
  );
}

/** 토글 칩 — SEED Chip.Toggle (outlineStrong, medium) */
export function Chip({
  selected,
  onClick,
  disabled,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <SeedChip.Toggle
      variant="outlineStrong"
      size="medium"
      checked={selected}
      disabled={disabled}
      onCheckedChange={() => onClick()}
    >
      <SeedChip.Label>{children}</SeedChip.Label>
    </SeedChip.Toggle>
  );
}

/** 2~4개 배타 옵션 — SEED SegmentedControl */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  className,
  "aria-label": ariaLabel = "보기 전환",
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <SegmentedControl
      aria-label={ariaLabel}
      value={value}
      onValueChange={(v) => onChange(v as T)}
      className={cn("w-full", className)}
    >
      {options.map((o) => (
        <SegmentedControlItem key={o.value} value={o.value} disabled={disabled}>
          {o.label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}

// ─── Feedback ────────────────────────────────────────────────────────

/** 빈 화면 — SEED ResultSection(medium) 규격 */
export function EmptyState({
  icon,
  tone = "gray",
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-x6 py-x12 text-center", className)}>
      <IconTile icon={icon} tone={tone} size={56} round />
      <div className="mt-x4 flex flex-col gap-x2">
        <p className="t5-bold text-fg-neutral">{title}</p>
        {description != null && (
          <p className="whitespace-pre-line t4-regular text-fg-neutral-subtle">{description}</p>
        )}
      </div>
      {action != null && <div className="mt-x6">{action}</div>}
    </div>
  );
}

const CALLOUT_TONE: Record<Tone, "neutral" | "informative" | "positive" | "warning" | "critical"> = {
  gray: "neutral",
  brand: "neutral",
  ok: "positive",
  warn: "warning",
  bad: "critical",
  info: "informative",
  violet: "informative",
};

/** 안내 박스 — SEED Callout */
export function Notice({
  tone = "gray",
  icon: Icon,
  title,
  children,
  className,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Callout
      tone={CALLOUT_TONE[tone]}
      prefixIcon={Icon ? <Icon strokeWidth={2.2} /> : undefined}
      title={title}
      description={children ?? ""}
      className={cn("w-full", className)}
    />
  );
}

export function ProgressBar({
  value,
  tone = "brand",
  className,
}: {
  value: number;
  tone?: "brand" | "ok" | "ink";
  className?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className={cn("h-x2 w-full overflow-hidden rounded-full bg-bg-neutral-weak", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-d6 ease-out",
          tone === "brand" ? "bg-bg-brand-solid" : tone === "ok" ? "bg-bg-positive-solid" : "bg-bg-neutral-solid"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** SEED Skeleton */
export function Skeleton({ className }: { className?: string }) {
  return <SeedSkeleton radius="8" tone="neutral" className={cn("block", className)} />;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** 마감일 D-day 라벨 + 톤 */
export function dueInfo(dueDate: Date, done = false): { label: string; tone: Tone; days: number } {
  const days = Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000);
  const label = days < 0 ? `D+${-days}` : days === 0 ? "D-Day" : `D-${days}`;
  const tone: Tone = done ? "gray" : days < 0 ? "bad" : days <= 1 ? "brand" : days <= 3 ? "warn" : "gray";
  return { label, tone, days };
}

// SEED 컴포넌트를 페이지에서 직접 쓰기 위한 재노출
export { ActionButton, Callout, SeedChip, SegmentedControl, SegmentedControlItem };
