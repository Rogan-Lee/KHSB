import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertTone = "bad" | "warn" | "info" | "ok";

// 아이콘 원 — SEED 역할색 weak 배경 + 역할색 글자 (색은 상태를 뜻할 때만)
const toneStyles: Record<AlertTone, string> = {
  bad: "bg-bg-critical-weak text-fg-critical",
  warn: "bg-bg-warning-weak text-fg-warning",
  info: "bg-bg-informative-weak text-fg-informative",
  ok: "bg-bg-positive-weak text-fg-positive",
};

interface AlertCardProps {
  tone: AlertTone;
  icon: React.ReactNode;
  title: string;
  sub?: string;
  cta?: string;
  onClick?: () => void;
  href?: string;
  className?: string;
}

// 흰 표면 + 옅은 선 + r4 (backoffice Section 과 같은 표면). 그림자·색 막대 없음.
const SHELL = cn(
  "flex w-full min-w-0 items-center gap-x3 rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default px-x4 py-x3_5 text-left",
  "outline-none transition-colors hover:bg-bg-layer-default-pressed",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring"
);

function Body({ tone, icon, title, sub, cta }: Pick<AlertCardProps, "tone" | "icon" | "title" | "sub" | "cta">) {
  return (
    <>
      <span
        aria-hidden
        className={cn("grid size-x9 shrink-0 place-items-center rounded-full [&_svg]:size-4", toneStyles[tone])}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate t4-bold text-fg-neutral">{title}</span>
        {sub && <span className="mt-x0_5 block truncate t3-regular text-fg-neutral-subtle">{sub}</span>}
      </span>
      {cta ? (
        <span className="inline-flex shrink-0 items-center gap-x0_5 t3-medium text-fg-neutral-muted">
          {cta}
          <ChevronRight className="size-4 text-fg-neutral-subtle" aria-hidden />
        </span>
      ) : (
        <ChevronRight className="size-4 shrink-0 text-fg-placeholder" aria-hidden />
      )}
    </>
  );
}

export function AlertCard({ tone, icon, title, sub, cta, onClick, href, className }: AlertCardProps) {
  if (href) {
    return (
      <Link href={href} className={cn(SHELL, className)}>
        <Body tone={tone} icon={icon} title={title} sub={sub} cta={cta} />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(SHELL, className)}>
      <Body tone={tone} icon={icon} title={title} sub={sub} cta={cta} />
    </button>
  );
}

/** 알림 카드 줄 — 모바일 1열, md 이상 cols 열 */
export function AlertStrip({ children, cols = 3, className }: { children: React.ReactNode; cols?: number; className?: string }) {
  return (
    <div
      className={cn("mb-x4 grid grid-cols-1 gap-x3 md:grid-cols-[repeat(var(--alert-cols),minmax(0,1fr))]", className)}
      style={{ "--alert-cols": cols } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
