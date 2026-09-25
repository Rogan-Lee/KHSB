"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, Play, ArrowRight, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTile, StatusBadge } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { startPatrolRound, endPatrolRound } from "@/actions/patrol";

type ActiveRound = { id: string; checkedCount: number } | null;

// 대시보드 순찰 위젯 — 여기서 바로 순찰 시작/종료. 시작하면 "순찰 중"으로 전환되고
// 종료 버튼이 노출됨. 전체 순찰 화면은 "순찰 화면으로"로 /patrol/run 진입.
export function PatrolStartWidget({ active }: { active: ActiveRound }) {
  const router = useRouter();
  const [round, setRound] = useState<ActiveRound>(active);
  const [pending, startTransition] = useTransition();
  const [confirmEnd, setConfirmEnd] = useState(false);

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
    startTransition(async () => {
      try {
        await endPatrolRound(undefined, round.id);
        setRound(null);
        setConfirmEnd(false);
        toast.success("순찰을 종료했어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "순찰 종료 실패");
      }
    });
  }

  return (
    <section
      aria-label="순찰"
      className="flex flex-col gap-x4 rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default p-x5 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-x4">
        <IconTile icon={ShieldCheck} tone={running ? "ok" : "brand"} size={48} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x2">
            <h2 className="t5-bold text-fg-neutral">
              {running ? `순찰 중 · 점검 ${checkedCount}건` : "지금 순찰을 시작하세요"}
            </h2>
            {running && <StatusBadge tone="ok">진행 중</StatusBadge>}
          </div>
          <p className="mt-x0_5 t4-regular text-fg-neutral-subtle">
            {running
              ? "순찰 화면에서 좌석별 점검을 이어서 기록할 수 있어요"
              : "순찰을 시작하면 좌석별 점검을 바로 기록할 수 있어요"}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-x2 max-sm:[&>*]:flex-1">
        {running ? (
          <>
            <Button variant="secondary" onClick={() => setConfirmEnd(true)} disabled={pending}>
              <Square />
              종료
            </Button>
            <Button asChild>
              <Link href="/patrol/run">
                순찰 화면으로
                <ArrowRight />
              </Link>
            </Button>
          </>
        ) : (
          <Button onClick={handleStart} disabled={pending}>
            <Play />
            {pending ? "시작하는 중…" : "순찰 시작"}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="순찰을 종료할까요?"
        description={`이번 순찰에서 점검 ${checkedCount}건을 기록했어요.`}
        confirmLabel="종료"
        pendingLabel="종료하는 중…"
        destructive={false}
        pending={pending}
        onConfirm={handleEnd}
      />
    </section>
  );
}
