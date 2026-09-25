// 대시보드(직원용) UI 키트 — SEED Design 토큰·컴포넌트 기반.
// 화면 뼈대: PageHeader → (Toolbar) → Section / StatCards / TableCard … 순서로 쌓는다.
//  · 훅을 쓰지 않으므로 서버/클라이언트 컴포넌트 양쪽에서 import 가능
//  · 버튼은 @/components/ui/button(SEED ActionButton), 입력은 @/components/ui/input(SEED TextInput 규격)
//  · 모바일 전용 프리미티브(BottomCTA 등)는 학생 포털(@/components/portal/ui) 소관 — 여기선 재노출하지 않는다.

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ChevronRight, Search, X, type LucideIcon } from "lucide-react";
import { Badge as SeedUiBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Avatar,
  avatarTone,
  CountBadge,
  IconTile,
  Notice,
  ProgressBar,
  Segmented,
  Skeleton,
  TONE_SOFT,
  TONE_SOLID,
  type Tone,
} from "@/components/portal/ui";

export { Avatar, avatarTone, CountBadge, IconTile, Notice, ProgressBar, Segmented, Skeleton, TONE_SOFT, TONE_SOLID };
export type { Tone };

// ─── Tone → SEED 역할 ────────────────────────────────────────────────

type SeedTone = "neutral" | "brand" | "informative" | "positive" | "warning" | "critical";

export const SEED_TONE: Record<Tone, SeedTone> = {
  gray: "neutral",
  brand: "brand",
  ok: "positive",
  warn: "warning",
  bad: "critical",
  info: "informative",
  violet: "informative",
};

/** 역할색 글자 (숫자·상태 문구) */
export const TONE_TEXT: Record<Tone, string> = {
  gray: "text-fg-neutral",
  brand: "text-fg-brand",
  ok: "text-fg-positive",
  warn: "text-fg-warning",
  bad: "text-fg-critical",
  info: "text-fg-informative",
  violet: "text-palette-purple-700",
};

/** 상태 배지 — SEED Badge (weak 기본, solid 는 강조가 꼭 필요할 때만) */
export function StatusBadge({
  tone = "gray",
  solid = false,
  size = "medium",
  className,
  children,
}: {
  tone?: Tone;
  solid?: boolean;
  size?: "medium" | "large";
  className?: string;
  children: ReactNode;
}) {
  return (
    <SeedUiBadge
      tone={SEED_TONE[tone]}
      solid={solid}
      size={size}
      className={cn(
        "tabular-nums",
        // SEED Badge 에 보라 역할색이 없어 팔레트로 덧씌운다 (분류용)
        tone === "violet" &&
          (solid ? "bg-palette-purple-600 text-palette-static-white" : "bg-palette-purple-100 text-palette-purple-700"),
        className,
      )}
    >
      {children}
    </SeedUiBadge>
  );
}

// ─── Page header ─────────────────────────────────────────────────────

/**
 * 페이지 머리 — 제목(한 줄) + 설명(한 줄) + 우측 주요 버튼.
 * 제목은 명사형으로 짧게("원생 관리"), 숫자·상태는 description 이나 meta 로.
 */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  back,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** 제목 옆 배지 등 */
  meta?: ReactNode;
  /** 우측 버튼들 — 주요 버튼(brand)은 하나만 */
  actions?: ReactNode;
  /** 상세 화면의 상위 목록 링크 */
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header className={cn("mb-x6 md:mb-x8", className)}>
      {back && (
        <Link
          href={back.href}
          className="-ml-1 mb-x3 inline-flex items-center gap-x1 rounded-r2 px-1 py-x0_5 t4-medium text-fg-neutral-subtle transition-colors hover:text-fg-neutral"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-x4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x2">
            <h1 className="t8-bold text-fg-neutral md:t10-bold">{title}</h1>
            {meta}
          </div>
          {description != null && (
            <p className="mt-x1_5 max-w-3xl t4-regular text-fg-neutral-subtle md:t5-regular">{description}</p>
          )}
        </div>
        {actions != null && <div className="flex shrink-0 flex-wrap items-center gap-x2">{actions}</div>}
      </div>
    </header>
  );
}

// ─── Section ─────────────────────────────────────────────────────────

/**
 * 내용 묶음.
 *  - variant="card"(기본): 흰 표면 + 옅은 선 + r4 — 표·목록·폼을 담는 기본 틀
 *  - variant="plain": 테두리 없이 제목만 — 페이지 안 큰 구획
 * flush 면 본문 패딩 없이 표/목록을 가장자리까지 붙인다.
 */
export function Section({
  title,
  description,
  count,
  actions,
  variant = "card",
  flush = false,
  className,
  bodyClassName,
  id,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  /** 제목 옆 개수 */
  count?: number;
  actions?: ReactNode;
  variant?: "card" | "plain";
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  id?: string;
  children?: ReactNode;
}) {
  const hasHeader = title != null || actions != null;
  const card = variant === "card";
  return (
    <section
      id={id}
      className={cn(card && "rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default", className)}
    >
      {hasHeader && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-x3",
            card ? "px-x5 pt-x5" : "pb-x3",
            card && (flush ? "pb-x3" : "pb-x4"),
          )}
        >
          <div className="min-w-0">
            {title != null && (
              <h2 className="flex items-center gap-x1_5 t6-bold text-fg-neutral">
                {title}
                {count != null && <span className="t6-bold tabular-nums text-fg-brand">{count}</span>}
              </h2>
            )}
            {description != null && <p className="mt-x0_5 t4-regular text-fg-neutral-subtle">{description}</p>}
          </div>
          {actions != null && <div className="flex shrink-0 flex-wrap items-center gap-x2">{actions}</div>}
        </div>
      )}
      {children != null && (
        <div
          className={cn(
            card && !flush && "px-x5 pb-x5",
            card && !flush && !hasHeader && "pt-x5",
            bodyClassName,
          )}
        >
          {children}
        </div>
      )}
    </section>
  );
}

/** 섹션 우측 "전체 보기 ›" 링크 */
export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-mr-1.5 inline-flex shrink-0 items-center rounded-r2 px-x1_5 py-x1 t4-medium text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
    >
      {children}
      <ChevronRight className="size-4" aria-hidden />
    </Link>
  );
}

// ─── Stats ───────────────────────────────────────────────────────────

/** 지표 카드 — 회색 채움 타일, 라벨 위 · 큰 숫자 아래 */
export function StatCard({
  label,
  value,
  unit,
  sub,
  tone = "gray",
  icon: Icon,
  href,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  /** 보조 줄 — 증감·비율 등 */
  sub?: ReactNode;
  /** 값 색 (주의가 필요할 때만 bad/warn) */
  tone?: Tone;
  icon?: LucideIcon;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-x1_5 t4-medium text-fg-neutral-subtle">
        {Icon && <Icon className="size-4" aria-hidden />}
        <span className="truncate">{label}</span>
        {href && <ChevronRight className="ml-auto size-4 text-fg-placeholder" aria-hidden />}
      </div>
      <div className="mt-x2 flex items-baseline gap-x1">
        <span className={cn("t10-bold tabular-nums", TONE_TEXT[tone])}>{value}</span>
        {unit != null && <span className="t5-medium text-fg-neutral-subtle">{unit}</span>}
      </div>
      {sub != null && <div className="mt-x1 t3-regular text-fg-neutral-subtle tabular-nums">{sub}</div>}
    </>
  );
  const cls = cn("block min-w-0 rounded-r4 bg-bg-layer-fill px-x5 py-x4", className);
  if (href) {
    return (
      <Link href={href} className={cn(cls, "transition-colors hover:bg-bg-neutral-weak")}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** 지표 카드 줄 — 모바일 2열, 데스크톱 cols 열 */
export function StatCards({
  cols = 4,
  className,
  children,
}: {
  cols?: 2 | 3 | 4 | 5;
  className?: string;
  children: ReactNode;
}) {
  const lg = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" }[cols];
  return <div className={cn("grid grid-cols-2 gap-x3", lg, className)}>{children}</div>;
}

// ─── Toolbar / filters ───────────────────────────────────────────────

/** 표 위 필터·검색·보조 버튼 줄 */
export function Toolbar({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mb-x4 flex flex-wrap items-center gap-x2", className)}>{children}</div>;
}

/**
 * 검색 입력 — SEED TextInput 규격 + 돋보기 아이콘. 클라이언트 컴포넌트에서 value/onChange 를 넘긴다.
 * onClear 를 주면 값이 있을 때 지우기(X) 버튼이 나타난다.
 */
export function SearchField({
  className,
  onClear,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { className?: string; onClear?: () => void }) {
  const hasValue = props.value != null && String(props.value).length > 0;
  return (
    <label
      className={cn(
        "flex h-10 w-full min-w-0 items-center gap-x2 rounded-r2 bg-bg-neutral-weak px-x3 transition-shadow focus-within:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)] focus-within:bg-bg-layer-default sm:w-72",
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
      <input
        type="search"
        {...props}
        className="h-full min-w-0 flex-1 bg-transparent t4-regular text-fg-neutral outline-none placeholder:text-fg-placeholder [&::-webkit-search-cancel-button]:hidden"
      />
      {onClear && hasValue && (
        <button
          type="button"
          onClick={onClear}
          aria-label="검색어 지우기"
          className="-mr-1 grid size-6 shrink-0 place-items-center rounded-full bg-fg-placeholder text-fg-neutral-inverted transition-colors hover:bg-fg-neutral-subtle"
        >
          <X className="size-3.5" strokeWidth={2.5} aria-hidden />
        </button>
      )}
    </label>
  );
}

/** 필터 칩 — SEED Chip(outlineStrong · small) 모양의 버튼. selected 면 채움 */
export function FilterChip({
  selected = false,
  count,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...props}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-x1 rounded-full px-x3 t3-medium transition-colors disabled:pointer-events-none disabled:text-fg-disabled",
        selected
          ? "bg-bg-neutral-inverted text-fg-neutral-inverted"
          : "bg-bg-layer-default text-fg-neutral-muted shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed",
        className,
      )}
    >
      {children}
      {count != null && (
        <span className={cn("tabular-nums", selected ? "text-fg-neutral-inverted/70" : "text-fg-neutral-subtle")}>
          {count}
        </span>
      )}
    </button>
  );
}

/** URL 기반 탭 (서버 컴포넌트용) — SEED Tabs(line) 모양 */
export function LinkTabs({
  items,
  current,
  className,
}: {
  items: { href: string; label: ReactNode; value: string; count?: number }[];
  current: string;
  className?: string;
}) {
  return (
    <nav
      className={cn(
        "mb-x5 flex w-full gap-x1 overflow-x-auto shadow-[inset_0_-1px_0_var(--seed-color-stroke-neutral-muted)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((it) => {
        const active = it.value === current;
        return (
          <Link
            key={it.value}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex min-h-11 shrink-0 items-center gap-x1_5 px-x2_5 t5-bold transition-colors",
              "after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full",
              active
                ? "text-fg-neutral after:bg-fg-neutral"
                : "text-fg-neutral-subtle hover:text-fg-neutral-muted after:bg-transparent",
            )}
          >
            {it.label}
            {it.count != null && it.count > 0 && (
              <span className={cn("t4-bold tabular-nums", active ? "text-fg-brand" : "text-fg-placeholder")}>
                {it.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Tables & lists ──────────────────────────────────────────────────

/** 표를 담는 카드 — 가로 스크롤 + 모서리 클립. 표는 @/components/ui/table 사용 */
export function TableCard({
  className,
  footer,
  children,
}: {
  className?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default", className)}>
      {children}
      {footer != null && (
        <div className="flex items-center justify-between gap-x3 border-t border-stroke-neutral-muted px-x4 py-x3">
          {footer}
        </div>
      )}
    </div>
  );
}

/** 목록 행 — 카드 안 세로 목록(최근 활동 등). href/onClick 이 있으면 누를 수 있다 */
export function ListItem({
  href,
  onClick,
  leading,
  title,
  description,
  trailing,
  chevron,
  className,
}: {
  href?: string;
  onClick?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  className?: string;
}) {
  const interactive = !!href || !!onClick;
  const body = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate t4-medium text-fg-neutral">{title}</div>
        {description != null && <div className="mt-x0_5 truncate t3-regular text-fg-neutral-subtle">{description}</div>}
      </div>
      {trailing != null && <div className="flex shrink-0 items-center gap-x2 t3-regular text-fg-neutral-subtle">{trailing}</div>}
      {(chevron ?? interactive) && <ChevronRight className="size-4 shrink-0 text-fg-placeholder" aria-hidden />}
    </>
  );
  const cls = cn(
    "flex w-full items-center gap-x3 px-x5 py-x3 text-left",
    interactive && "transition-colors hover:bg-bg-layer-default-pressed",
    className,
  );
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

/** 라벨·값 목록 (상세 화면 기본 정보) */
export function DescriptionList({
  items,
  cols = 2,
  className,
}: {
  items: { label: ReactNode; value: ReactNode; full?: boolean }[];
  cols?: 1 | 2 | 3;
  className?: string;
}) {
  const grid = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" }[cols];
  return (
    <dl className={cn("grid grid-cols-1 gap-x-x6 gap-y-x4", grid, className)}>
      {items.map((it, i) => (
        <div key={i} className={cn("min-w-0", it.full && "sm:col-span-full")}>
          <dt className="t3-medium text-fg-neutral-subtle">{it.label}</dt>
          <dd className="mt-x1 break-words t4-regular text-fg-neutral">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Feedback ────────────────────────────────────────────────────────

/** 빈 상태 — SEED ResultSection(medium) 규격. compact 는 카드 안 작은 공간용 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-x4 py-x8" : "px-x6 py-x16",
        className,
      )}
    >
      {Icon && (
        <span
          aria-hidden
          className={cn(
            "mb-x4 grid place-items-center rounded-full bg-bg-neutral-weak text-fg-neutral-subtle",
            compact ? "size-x10" : "size-x14",
          )}
        >
          <Icon className={compact ? "size-5" : "size-7"} />
        </span>
      )}
      <p className={cn("text-fg-neutral", compact ? "t4-bold" : "t5-bold")}>{title}</p>
      {description != null && (
        <p className="mt-x1_5 max-w-sm whitespace-pre-line t4-regular text-fg-neutral-subtle">{description}</p>
      )}
      {action != null && <div className="mt-x5">{action}</div>}
    </div>
  );
}

/** 폼 필드 — 라벨(t4 medium) + 입력 + 도움말/오류 */
export function FormField({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-x2", className)}>
      <label htmlFor={htmlFor} className="t4-medium text-fg-neutral">
        {label}
        {required && <span className="ml-x0_5 text-fg-brand">*</span>}
      </label>
      {children}
      {error ? (
        <p className="t3-regular text-fg-critical">{error}</p>
      ) : hint != null ? (
        <p className="t3-regular text-fg-neutral-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/** 폼 하단 버튼 줄 */
export function FormActions({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-wrap items-center justify-end gap-x2 pt-x2", className)}>{children}</div>;
}
