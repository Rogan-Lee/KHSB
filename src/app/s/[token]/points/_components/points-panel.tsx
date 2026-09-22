"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Coins, Gift, TrendingUp, TrendingDown, X } from "lucide-react";
import {
  requestRedemption,
  type PointHistoryEntry,
  type RewardItemView,
  type RedemptionView,
} from "@/actions/rewards";
import { pointsToKrw } from "@/lib/points";
import type { RedemptionStatus } from "@/generated/prisma/enums";

const STATUS_LABELS: Record<RedemptionStatus, string> = {
  PENDING: "대기중",
  APPROVED: "승인됨",
  REJECTED: "거절됨",
  FULFILLED: "지급완료",
};

const STATUS_BADGE: Record<RedemptionStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
  APPROVED: "bg-blue-100 text-blue-700 border-blue-200",
  REJECTED: "bg-gray-100 text-gray-600 border-gray-200",
  FULFILLED: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  });
}

function fmtKrw(points: number): string {
  return `약 ${pointsToKrw(points).toLocaleString("ko-KR")}원`;
}

export function PointsPanel({
  token,
  data,
}: {
  token: string;
  data: {
    balance: number;
    history: PointHistoryEntry[];
    items: RewardItemView[];
    myRedemptions: RedemptionView[];
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmItem, setConfirmItem] = useState<RewardItemView | null>(null);

  function submit(item: RewardItemView) {
    startTransition(async () => {
      try {
        await requestRedemption(token, item.id);
        toast.success(`"${item.name}" 교환을 신청했어요`);
        setConfirmItem(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "신청 실패");
      }
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-[18px] font-bold tracking-[-0.02em] text-ink">포인트</h1>

      {/* 잔액 카드 */}
      <div className="rounded-[14px] border border-line bg-panel p-4">
        <div className="flex items-center gap-2 text-ink-3">
          <Coins className="h-4 w-4" />
          <span className="text-[12px] font-medium">내 포인트</span>
        </div>
        <p className="mt-1 text-[28px] font-bold tracking-[-0.02em] text-ink">
          {data.balance.toLocaleString("ko-KR")}점
        </p>
        <p className="text-[13px] text-ink-4">{fmtKrw(data.balance)} 상당</p>
      </div>

      {/* 상점 */}
      <section>
        <h2 className="mb-2 text-[14px] font-semibold text-ink">기프티콘 상점</h2>
        {data.items.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-line bg-canvas-2/40 px-5 py-8 text-center text-[13px] text-ink-4">
            아직 등록된 상품이 없어요
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {data.items.map((item) => {
              const affordable = data.balance >= item.points;
              return (
                <div key={item.id} className="flex flex-col rounded-[14px] border border-line bg-panel p-3.5">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-canvas-2 text-ink-3">
                    <Gift className="h-4.5 w-4.5" />
                  </span>
                  <p className="mt-2 text-[14px] font-semibold leading-tight text-ink">{item.name}</p>
                  <p className="mt-0.5 text-[12px] text-ink-4">
                    {item.points}점 · {fmtKrw(item.points)}
                  </p>
                  <button
                    type="button"
                    disabled={!affordable || pending}
                    onClick={() => setConfirmItem(item)}
                    className="mt-2.5 inline-flex h-9 items-center justify-center rounded-lg bg-brand text-[13px] font-semibold text-white disabled:bg-canvas-2 disabled:text-ink-4"
                  >
                    {affordable ? "신청하기" : "포인트 부족"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 신청 확인 */}
      {confirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-[360px] rounded-[14px] border border-line bg-panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[15px] font-semibold text-ink">교환 신청</p>
              <button type="button" onClick={() => setConfirmItem(null)} className="rounded-lg p-1 text-ink-4">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <p className="text-[14px] text-ink-2">
              <span className="font-semibold">{confirmItem.name}</span>을(를) {confirmItem.points}점으로
              교환 신청할까요?
            </p>
            <p className="mt-1 text-[12px] text-ink-4">선생님 승인 후 지급됩니다.</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmItem(null)}
                className="h-10 flex-1 rounded-xl border border-line bg-panel text-[14px] font-medium text-ink-2"
              >
                취소
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => submit(confirmItem)}
                className="h-10 flex-1 rounded-xl bg-brand text-[14px] font-semibold text-white disabled:opacity-50"
              >
                신청하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 내 신청 현황 */}
      {data.myRedemptions.length > 0 && (
        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-ink">내 신청 현황</h2>
          <ul className="divide-y divide-line rounded-[14px] border border-line bg-panel">
            {data.myRedemptions.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-ink">{r.itemName}</p>
                  <p className="text-[12px] text-ink-4">
                    {fmtDate(r.createdAt)} · {r.points}점
                    {r.status === "REJECTED" && r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[r.status]}`}
                >
                  {STATUS_LABELS[r.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 포인트 내역 */}
      <section>
        <h2 className="mb-2 text-[14px] font-semibold text-ink">포인트 내역</h2>
        {data.history.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-line bg-canvas-2/40 px-5 py-8 text-center text-[13px] text-ink-4">
            아직 포인트 내역이 없어요
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-[14px] border border-line bg-panel">
            {data.history.map((h, i) => {
              const plus = h.kind === "MERIT";
              const isRedemption = h.kind === "REDEMPTION";
              return (
                <li key={i} className="flex items-center gap-2.5 px-3.5 py-3">
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      plus ? "bg-emerald-50 text-emerald-600" : isRedemption ? "bg-blue-50 text-blue-600" : "bg-red-50 text-red-500"
                    }`}
                  >
                    {plus ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : isRedemption ? (
                      <Gift className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-ink">{h.label}</p>
                    <p className="text-[11.5px] text-ink-4">
                      {fmtDate(h.date)}
                      {isRedemption && h.status ? ` · ${STATUS_LABELS[h.status]}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-[13.5px] font-semibold tabular-nums ${
                      plus ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {plus ? "+" : "−"}
                    {h.points}점
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
