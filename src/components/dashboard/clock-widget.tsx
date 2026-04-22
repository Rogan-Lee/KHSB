"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  const [, setNow] = useState(Date.now());

  // 근무 중이면 1분마다 리렌더해서 경과 시간 업데이트
  useEffect(() => {
    if (!status?.isWorking) return;
    const id = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, [status?.isWorking]);

  const workingMs = status?.isWorking && status.lastTag
    ? Date.now() - new Date(status.lastTag.taggedAt).getTime()
    : 0;

  function handleClockIn() {
    startTransition(async () => {
      try {
        const tag = await clockIn();
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

  return (
    <div
      className={cn(
        "rounded-[12px] border px-[14px] py-3 flex items-center gap-3 transition-colors",
        "shadow-[var(--shadow-xs)]",
        status?.isWorking
          ? "border-ok/30 bg-ok-soft"
          : "border-line bg-panel"
      )}
    >
      <span
        className={cn(
          "grid place-items-center w-[36px] h-[36px] rounded-[10px] shrink-0",
          status?.isWorking ? "bg-ok text-white" : "bg-ink-6 text-ink-3"
        )}
      >
        <Clock className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-ink-4 leading-none mb-1">내 출퇴근</p>
        {status?.isWorking && status.lastTag ? (
          <p className="text-[13px] font-semibold text-ok-ink leading-tight">
            근무 중 · {fmtDuration(workingMs)}
          </p>
        ) : (
          <p className="text-[13px] font-semibold text-ink tracking-[-0.01em] leading-tight">
            출근 전
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {!status?.isWorking ? (
          <Button
            size="sm"
            onClick={handleClockIn}
            disabled={pending}
            className="bg-ok hover:bg-ok/90 text-white h-8 text-xs"
          >
            <LogIn className="h-3.5 w-3.5 mr-1" />
            출근
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={handleClockOut}
            disabled={pending}
            className="h-8 text-xs"
          >
            <LogOut className="h-3.5 w-3.5 mr-1" />
            퇴근
          </Button>
        )}
        <Link href="/payroll/me" title="전체 기록 보기" className="p-1.5 rounded-[8px] hover:bg-panel-2 text-ink-4">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
