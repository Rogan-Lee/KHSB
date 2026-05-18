"use client";

import { useState, useTransition } from "react";
import { LogIn, LogOut, Loader2, AlertCircle } from "lucide-react";
import { submitClockEvent } from "@/actions/staff-portal";

export function ClockButtons({ token, isWorking }: { token: string; isWorking: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"CLOCK_IN" | "CLOCK_OUT" | null>(null);

  function handleClick(type: "CLOCK_IN" | "CLOCK_OUT") {
    setError(null);
    setActiveType(type);
    startTransition(async () => {
      try {
        await submitClockEvent(token, type);
        // server action 의 revalidatePath 가 페이지를 재생성하지만, 즉시 반영 위해 reload
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "처리에 실패했어요. 잠시 후 다시 시도해 주세요.");
        setActiveType(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handleClick("CLOCK_IN")}
          disabled={pending || isWorking}
          className="inline-flex h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-emerald-600 text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending && activeType === "CLOCK_IN" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <LogIn className="h-5 w-5" strokeWidth={2.4} />
          )}
          <span className="text-[14px] font-bold">출근</span>
        </button>
        <button
          type="button"
          onClick={() => handleClick("CLOCK_OUT")}
          disabled={pending || !isWorking}
          className="inline-flex h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-rose-600 text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending && activeType === "CLOCK_OUT" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <LogOut className="h-5 w-5" strokeWidth={2.4} />
          )}
          <span className="text-[14px] font-bold">퇴근</span>
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
