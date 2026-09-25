"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/backoffice/ui";
import { Clock, LogIn, LogOut, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { clockIn, clockOut } from "@/actions/payroll";
import type { WorkTag } from "@/generated/prisma";

type Status = { lastTag: WorkTag | null; isWorking: boolean } | null;

function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}분`;
  return `${h}시간 ${m}분`;
}

export function ClockWidget({ initial }: { initial: Status }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>(initial);
  const [now, setNow] = useState(() => Date.now());

  // 근무 중이면 1분마다 리렌더해서 경과 시간 업데이트
  useEffect(() => {
    if (!status?.isWorking) return;
    const id = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, [status?.isWorking]);

  const workingMs = status?.isWorking && status.lastTag
    ? now - new Date(status.lastTag.taggedAt).getTime()
    : 0;

  function handleClockIn() {
    startTransition(async () => {
      try {
        const tag = await clockIn();
        setNow(Date.now());
        setStatus({ lastTag: tag, isWorking: true });
        toast.success("출근 태깅 완료");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "출근 실패");
      }
    });
  }

  function handleClockOut() {
    if (!confirm("퇴근 태깅을 하시겠습니까?")) return;
    startTransition(async () => {
      try {
        const tag = await clockOut();
        setStatus({ lastTag: tag, isWorking: false });
        toast.success("퇴근 태깅 완료");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "퇴근 실패");
      }
    });
  }

  const working = !!status?.isWorking;

  return (
    <div className="flex items-center gap-x3 rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default px-x4 py-x3">
      <IconTile icon={Clock} tone={working ? "ok" : "gray"} size={40} />
      <div className="min-w-0 flex-1">
        <p className="t3-regular text-fg-neutral-subtle">내 출퇴근</p>
        {working && status?.lastTag ? (
          <p className="t4-bold text-fg-positive">근무 중 · {fmtDuration(workingMs)}</p>
        ) : (
          <p className="t4-bold text-fg-neutral">출근 전</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-x1_5">
        {!working ? (
          <Button size="sm" onClick={handleClockIn} disabled={pending}>
            <LogIn />
            출근
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={handleClockOut} disabled={pending}>
            <LogOut />
            퇴근
          </Button>
        )}
        <Button asChild variant="ghost" size="icon" title="전체 기록 보기">
          <Link href="/payroll/me" aria-label="전체 출퇴근 기록 보기">
            <ArrowUpRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}
