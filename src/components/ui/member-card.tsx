import { cn } from "@/lib/utils";
import { TagPill } from "./tag-pill";
import { ChevronRight } from "lucide-react";

type AvatarTone = 1 | 2 | 3 | 4 | 5 | 6;

interface MetaField {
  label: string;
  value: React.ReactNode;
}

interface MemberCardProps {
  name: string;
  role?: string;
  initial?: string;
  imageUrl?: string | null;
  tone?: AvatarTone;
  pill?: { tone: "ok" | "warn" | "bad" | "info" | "brand" | "violet" | "neutral"; label: string };
  meta?: MetaField[];          // up to 2 key/value pairs (Dept / Join, etc)
  email?: string;
  phone?: string;
  onOpen?: () => void;
  className?: string;
}

function computeInitial(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 1).toUpperCase();
}

function hashTone(seed: string): AvatarTone {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ((h % 6) + 1) as AvatarTone;
}

// 사람 카드 — 흰 표면 + 옅은 선 + r4, 호버는 눌림 배경만(그림자·들림 없음).
// 이니셜 아바타 색(av-tone-1~6)은 globals.css 의 SEED 팔레트 단색.
export function MemberCard({
  name,
  role,
  initial,
  imageUrl,
  tone,
  pill,
  meta,
  email,
  phone,
  onOpen,
  className,
}: MemberCardProps) {
  const resolvedTone = tone ?? hashTone(name);
  const resolvedInitial = initial ?? computeInitial(name);

  return (
    <div
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      className={cn(
        "group relative flex h-full cursor-pointer flex-col rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default p-x5",
        "outline-none transition-colors hover:bg-bg-layer-default-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring",
        className
      )}
    >
      {pill && (
        <div className="absolute right-4 top-4">
          <TagPill variant={pill.tone}>{pill.label}</TagPill>
        </div>
      )}

      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={name}
          className="mb-x3 size-x10 rounded-full bg-bg-neutral-weak object-cover"
        />
      ) : (
        <div
          aria-hidden
          className={cn(
            "mb-x3 grid size-x10 place-items-center rounded-full t5-bold text-palette-static-white",
            `av-tone-${resolvedTone}`
          )}
        >
          {resolvedInitial}
        </div>
      )}

      <div className="truncate t5-bold text-fg-neutral">{name}</div>
      {role && <div className="mt-x0_5 truncate t3-regular text-fg-neutral-subtle">{role}</div>}

      {meta && meta.length > 0 && (
        <dl className="mt-x4 grid grid-cols-2 gap-x-x4 gap-y-x3 border-t border-stroke-neutral-muted pt-x4">
          {meta.map((m) => (
            <div key={m.label} className="min-w-0">
              <dt className="t2-regular text-fg-neutral-subtle">{m.label}</dt>
              <dd className="mt-x0_5 truncate t4-medium tabular-nums text-fg-neutral">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {(email || phone) && (
        <div className="mt-auto pt-x4">
          <div className="flex items-center gap-x2_5 border-t border-stroke-neutral-muted pt-x3">
            <div className="min-w-0 flex-1">
              {email && <div className="truncate t3-medium text-fg-neutral-muted">{email}</div>}
              {phone && <div className="mt-x0_5 truncate t3-regular tabular-nums text-fg-neutral-subtle">{phone}</div>}
            </div>
            <ChevronRight className="size-4 shrink-0 text-fg-placeholder transition-colors group-hover:text-fg-neutral-muted" aria-hidden />
          </div>
        </div>
      )}
    </div>
  );
}
