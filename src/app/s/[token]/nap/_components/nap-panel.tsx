"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Moon } from "lucide-react";
import { requestNap, type NapView } from "@/actions/nap";
import { TimePickerInput } from "@/components/ui/time-picker";
import type { NapStatus } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<NapStatus, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "거절",
};
const STATUS_TONE: Record<NapStatus, string> = {
  PENDING: "bg-warn-soft text-warn-ink",
  APPROVED: "bg-ok-soft text-ok-ink",
  REJECTED: "bg-bad-soft text-bad-ink",
};

function nowKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

export function NapPanel({
  token,
  naps,
  todayCount,
  limit,
}: {
  token: string;
  naps: NapView[];
  todayCount: number;
  limit: number;
}) {
  const router = useRouter();
  const [startTime, setStartTime] = useState(nowKST());
  const [durationMin, setDurationMin] = useState(20);
  const [pending, startTransition] = useTransition();
  const remaining = Math.max(0, limit - todayCount);

  function submit() {
    startTransition(async () => {
      try {
        await requestNap(token, { startTime, durationMin });
        toast.success("쪽잠 신청이 접수되었어요");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "신청에 실패했어요");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-bold tracking-[-0.02em] text-ink">쪽잠 신청</h1>
        <span className="rounded-full bg-canvas-2 px-3 py-1 text-[12px] font-semibold tabular-nums text-ink-3">
          오늘 {todayCount}/{limit}회
        </span>
      </div>

      {/* 신청 폼 */}
      <div className="rounded-[14px] border border-line bg-panel p-4">
        {remaining === 0 ? (
          <p className="rounded-lg bg-canvas-2 px-3 py-2.5 text-[13px] text-ink-3">
            쪽잠은 하루 {limit}회까지 신청할 수 있어요. 내일 다시 신청해 주세요.
          </p>
        ) : (
          <>
            <label className="mb-1 block text-[12px] font-medium text-ink-3">시작 시간</label>
            <TimePickerInput value={startTime} onChange={setStartTime} className="mb-3" />

            <label className="mb-1 block text-[12px] font-medium text-ink-3">쪽잠 시간</label>
            <div className="mb-3 flex gap-1.5">
              {[20, 30].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDurationMin(m)}
                  className={`rounded-full border px-4 py-1.5 text-[13px] font-medium ${
                    durationMin === m
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-panel text-ink-3 hover:bg-canvas-2"
                  }`}
                >
                  {m}분
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand text-[15px] font-semibold text-white disabled:opacity-50"
            >
              <Moon className="h-4 w-4" strokeWidth={2.5} />
              쪽잠 신청하기
            </button>
            <p className="mt-2 text-center text-[11.5px] text-ink-4">
              직원 승인 후 이용할 수 있어요 · 오늘 {remaining}회 남음
            </p>
          </>
        )}
      </div>

      {/* 신청 내역 (오늘 + 최근 7일) */}
      {naps.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line bg-canvas-2/40 px-5 py-10 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-panel text-ink-4">
            <Moon className="h-6 w-6" />
          </span>
          <p className="mt-3 text-[13.5px] font-semibold text-ink-2">아직 신청 내역이 없어요</p>
          <p className="mt-1 text-[12px] text-ink-4">피곤할 땐 무리하지 말고 쪽잠을 신청하세요.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {naps.map((n) => (
            <li key={n.id} className="rounded-[14px] border border-line bg-panel p-3.5">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STATUS_TONE[n.status]}`}
                >
                  {STATUS_LABEL[n.status]}
                </span>
                <span className="text-[13.5px] font-semibold tabular-nums text-ink">
                  {n.startTime} · {n.durationMin}분
                </span>
                <span className="ml-auto text-[11.5px] tabular-nums text-ink-4">
                  {n.date.slice(5).replace("-", "/")}
                </span>
              </div>
              {n.note && (
                <p className="mt-2 rounded-lg bg-canvas-2 px-3 py-2 text-[12px] text-ink-3">
                  {n.note}
                  {n.decidedByName ? ` — ${n.decidedByName}` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
