"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Coins, Gift, TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";
import {
  requestRedemption,
  type PointHistoryEntry,
  type RewardItemView,
  type RedemptionView,
} from "@/actions/rewards";
import { pointsToKrw } from "@/lib/points";
import { cn } from "@/lib/utils";
import { Badge, Button, EmptyState, IconTile, ListRow, Section, type Tone } from "@/components/portal/ui";
import { BottomSheet } from "@/components/portal/bottom-sheet";
import { REDEMPTION_STATUS } from "@/components/portal/status";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  });
}

function fmtPoints(points: number): string {
  return `${points.toLocaleString("ko-KR")}점`;
}

function fmtKrw(points: number): string {
  return `약 ${pointsToKrw(points).toLocaleString("ko-KR")}원`;
}

const HISTORY_ICON: Record<PointHistoryEntry["kind"], { icon: LucideIcon; tone: Tone }> = {
  MERIT: { icon: TrendingUp, tone: "brand" },
  DEMERIT: { icon: TrendingDown, tone: "gray" },
  REDEMPTION: { icon: Gift, tone: "gray" },
};

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
  // 시트가 닫히는 애니메이션 동안 내용이 비지 않도록 선택 상품과 열림 상태를 분리
  const [confirmItem, setConfirmItem] = useState<RewardItemView | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  function openConfirm(item: RewardItemView) {
    setConfirmItem(item);
    setSheetOpen(true);
  }

  function submit(item: RewardItemView) {
    startTransition(async () => {
      try {
        await requestRedemption(token, item.id);
        toast.success(`"${item.name}" 교환을 신청했어요`);
        setSheetOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "신청 실패");
      }
    });
  }

  return (
    <div className="flex flex-col gap-x3">
      {/* 잔액 */}
      <Section>
        <div className="flex items-start justify-between gap-x3">
          <div className="min-w-0">
            <p className="t4-medium text-fg-neutral-muted">내 포인트</p>
            <p className="mt-x1 t12-bold text-fg-neutral tabular-nums">{fmtPoints(data.balance)}</p>
            <p className="mt-x1 t4-regular text-fg-neutral-subtle tabular-nums">{fmtKrw(data.balance)} 상당</p>
          </div>
          <IconTile icon={Coins} tone="brand" size={48} round />
        </div>
      </Section>

      {/* 상점 */}
      <Section title="기프티콘 상점" description="모은 포인트로 기프티콘을 받을 수 있어요">
        {data.items.length === 0 ? (
          <EmptyState icon={Gift} title="아직 등록된 상품이 없어요" className="py-x6" />
        ) : (
          <div className="grid grid-cols-2 gap-x2">
            {data.items.map((item) => {
              const affordable = data.balance >= item.points;
              return (
                <div key={item.id} className="flex flex-col rounded-r4 bg-bg-layer-fill p-x4">
                  <IconTile icon={Gift} tone="brand" size={40} className="bg-bg-layer-default" />
                  <p className="mt-x3 line-clamp-2 t5-medium text-fg-neutral">{item.name}</p>
                  <p className="mt-x1 t5-bold text-fg-neutral-muted tabular-nums">{fmtPoints(item.points)}</p>
                  <p className="t2-regular text-fg-neutral-subtle tabular-nums">{fmtKrw(item.points)}</p>
                  <div className="mt-auto pt-x3">
                    <Button
                      size="sm"
                      variant="weak"
                      block
                      disabled={!affordable || pending}
                      onClick={() => openConfirm(item)}
                    >
                      {affordable ? "교환하기" : "포인트 부족"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* 내 신청 현황 */}
      {data.myRedemptions.length > 0 && (
        <Section title="내 신청 현황" flush>
          {data.myRedemptions.map((r) => {
            const st = REDEMPTION_STATUS[r.status];
            return (
              <ListRow
                key={r.id}
                leading={<IconTile icon={Gift} tone="gray" />}
                title={<span className="block truncate">{r.itemName}</span>}
                description={
                  <>
                    <span className="tabular-nums">
                      {fmtDate(r.createdAt)} · {fmtPoints(r.points)}
                    </span>
                    {r.status === "REJECTED" && r.note && (
                      <span className="mt-x0_5 block text-fg-neutral-muted">{r.note}</span>
                    )}
                  </>
                }
                trailing={<Badge tone={st.tone}>{st.label}</Badge>}
              />
            );
          })}
        </Section>
      )}

      {/* 포인트 내역 */}
      <Section title="포인트 내역" flush>
        {data.history.length === 0 ? (
          <EmptyState icon={Coins} title="아직 포인트 내역이 없어요" className="py-x8" />
        ) : (
          data.history.map((h, i) => {
            const plus = h.kind === "MERIT";
            const isRedemption = h.kind === "REDEMPTION";
            // 승인 전 교환은 아직 차감 전이라 흐리게
            const waiting = isRedemption && h.status === "PENDING";
            const icon = HISTORY_ICON[h.kind];
            return (
              <ListRow
                key={i}
                leading={<IconTile icon={icon.icon} tone={icon.tone} />}
                title={<span className="block truncate">{h.label}</span>}
                description={
                  <span className="tabular-nums">
                    {fmtDate(h.date)}
                    {isRedemption && h.status ? ` · ${REDEMPTION_STATUS[h.status].label}` : ""}
                  </span>
                }
                trailing={
                  <span
                    className={cn(
                      "t5-bold tabular-nums",
                      plus ? "text-fg-brand" : waiting ? "text-fg-neutral-subtle" : "text-fg-neutral"
                    )}
                  >
                    {plus ? "+" : "−"}
                    {fmtPoints(h.points)}
                  </span>
                }
              />
            );
          })
        )}
      </Section>

      {/* 교환 확인 */}
      <BottomSheet
        open={sheetOpen}
        onOpenChange={(o) => {
          if (!pending) setSheetOpen(o);
        }}
        title={confirmItem ? `${confirmItem.name} 교환할까요?` : "교환할까요?"}
        description={
          confirmItem ? (
            <>
              <span className="font-bold text-fg-neutral tabular-nums">{fmtPoints(confirmItem.points)}</span>
              을 사용해요. 선생님 승인 후 지급돼요.
            </>
          ) : undefined
        }
        footer={
          <>
            <Button
              variant="gray"
              size="xl"
              className="flex-1"
              disabled={pending}
              onClick={() => setSheetOpen(false)}
            >
              취소
            </Button>
            <Button
              variant="primary"
              size="xl"
              className="flex-1"
              loading={pending}
              onClick={() => confirmItem && submit(confirmItem)}
            >
              교환 신청
            </Button>
          </>
        }
      />
    </div>
  );
}
