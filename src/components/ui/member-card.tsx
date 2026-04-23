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

export function MemberCard({
  name,
  role,
  initial,
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
      className={cn(
        "group relative rounded-[12px] border border-line bg-panel p-4",
        "shadow-[var(--shadow-xs)] transition-all cursor-pointer",
        "hover:border-line-strong hover:shadow-[var(--shadow-md)] hover:-translate-y-[1px]",
        className
      )}
    >
      {pill && (
        <div className="absolute top-3.5 right-3.5">
          <TagPill variant={pill.tone}>{pill.label}</TagPill>
        </div>
      )}

      <div
        className={cn(
          "w-10 h-10 rounded-full grid place-items-center mb-3",
          "text-[14px] font-bold text-white tracking-[-0.02em]",
          "shadow-[inset_0_0_0_2px_rgba(255,255,255,0.6)]",
          `av-tone-${resolvedTone}`
        )}
      >
        {resolvedInitial}
      </div>

      <div className="text-[15px] font-[650] tracking-[-0.02em] text-ink mb-[1px] truncate">{name}</div>
      {role && <div className="text-[12.5px] text-ink-3 mb-3 truncate">{role}</div>}

      {meta && meta.length > 0 && (
        <div className="pt-3 border-t border-line-2 grid grid-cols-2 gap-x-[14px] gap-y-[10px]">
          {meta.map((m) => (
            <div key={m.label}>
              <div className="text-[11px] text-ink-4 font-medium mb-0.5">{m.label}</div>
              <div className="text-[12.5px] text-ink-2 font-medium tracking-[-0.01em] truncate">{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {(email || phone) && (
        <div className="pt-3 mt-3 border-t border-line-2 flex items-center gap-2.5">
          <div className="flex-1 min-w-0">
            {email && <div className="text-[12px] text-ink-2 font-medium truncate">{email}</div>}
            {phone && <div className="text-[11.5px] text-ink-4 font-mono tabular-nums mt-0.5 truncate">{phone}</div>}
          </div>
          <div className={cn(
            "w-[26px] h-[26px] rounded-full grid place-items-center shrink-0",
            "bg-canvas text-ink-3 transition-colors",
            "group-hover:bg-ink group-hover:text-white"
          )}>
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </div>
      )}
    </div>
  );
}
