"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ShieldCheck, Play, ArrowRight, Square, Loader2 } from "lucide-react";
import { startPatrolRound, endPatrolRound } from "@/actions/patrol";

type ActiveRound = { id: string; checkedCount: number } | null;

// 대시보드 순찰 위젯 — 여기서 바로 순찰 시작/종료. 시작하면 "순찰 중"으로 전환되고
// 종료 버튼이 노출됨. 전체 순찰 화면은 "이동"으로 /patrol/run 진입.
export function PatrolStartWidget({ active }: { active: ActiveRound }) {
  const router = useRouter();
  const [round, setRound] = useState<ActiveRound>(active);
  const [pending, startTransition] = useTransition();

  const running = round != null;
  // 서버 prop(active)이 로컬 round 와 같은 회차면 최신 점검 수를 신뢰
  const checkedCount =
    active && round && active.id === round.id ? active.checkedCount : round?.checkedCount ?? 0;

  function handleStart() {
    startTransition(async () => {
      try {
        const r = await startPatrolRound();
        setRound({ id: r.id, checkedCount: 0 });
        toast.success(r.reused ? "진행 중인 순찰에 합류했어요" : "순찰을 시작했어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "순찰 시작 실패");
      }
    });
  }

  function handleEnd() {
    if (!round) return;
    if (!confirm("순찰을 종료할까요?")) return;
    startTransition(async () => {
      try {
        await endPatrolRound(undefined, round.id);
        setRound(null);
        toast.success("순찰을 종료했어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "순찰 종료 실패");
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-[12px] border px-[14px] py-3 flex items-center gap-3 transition-colors shadow-[var(--shadow-xs)]",
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
            순찰 중 · 점검 {checkedCount}건
          </p>
        ) : (
          <p className="text-[13px] font-semibold text-ink tracking-[-0.01em] leading-tight">
            지금 순찰을 시작하세요
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {running ? (
          <>
            <Link
              href="/patrol/run"
              className="inline-flex items-center gap-1 rounded-[8px] border border-ok/40 px-3 h-8 text-xs font-semibold text-ok-ink hover:bg-ok/10"
            >
              이동 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={handleEnd}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-[8px] border border-line px-3 h-8 text-xs font-semibold text-ink-3 hover:bg-panel-2 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
              종료
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleStart}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-[8px] bg-slate-900 px-3 h-8 text-xs font-semibold text-white disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            순찰 시작
          </button>
        )}
      </div>
    </div>
  );
}
