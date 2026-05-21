import Link from "next/link";
import { cn } from "@/lib/utils";
import { ShieldCheck, Play, ArrowRight } from "lucide-react";

type ActiveRound = { id: string; checkedCount: number } | null;

// 대시보드 순찰 시작 위젯 — 클릭 시 앱 내 순찰 모드(/patrol/run)로 진입.
// 진행 중 회차가 있으면 "순찰 중 · 계속", 없으면 "순찰 시작".
export function PatrolStartWidget({ active }: { active: ActiveRound }) {
  const running = active != null;
  return (
    <Link
      href="/patrol/run"
      className={cn(
        "rounded-[12px] border px-[14px] py-3 flex items-center gap-3 transition-colors",
        "shadow-[var(--shadow-xs)] hover:bg-panel-2",
        running ? "border-ok/30 bg-ok-soft" : "border-line bg-panel"
      )}
    >
      <span
        className={cn(
          "grid place-items-center w-[36px] h-[36px] rounded-[10px] shrink-0",
          running ? "bg-ok text-white" : "bg-ink-6 text-ink-3"
        )}
      >
        <ShieldCheck className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-ink-4 leading-none mb-1">순찰</p>
        {running ? (
          <p className="text-[13px] font-semibold text-ok-ink leading-tight">
            순찰 중 · 점검 {active!.checkedCount}건
          </p>
        ) : (
          <p className="text-[13px] font-semibold text-ink tracking-[-0.01em] leading-tight">
            지금 순찰을 시작하세요
          </p>
        )}
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-[8px] px-3 h-8 text-xs font-semibold shrink-0",
          running ? "border border-ok/40 text-ok-ink" : "bg-slate-900 text-white"
        )}
      >
        {running ? (
          <>
            계속 <ArrowRight className="h-3.5 w-3.5" />
          </>
        ) : (
          <>
            <Play className="h-3.5 w-3.5" /> 순찰 시작
          </>
        )}
      </span>
    </Link>
  );
}
