import { Coins, Gift, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  BottomSheet,
  Button,
  color,
  EmptyState,
  IconTile,
  ListRow,
  radius,
  Section,
  Skeleton,
  space,
  Stack,
  Text,
  type Tone,
} from '@/design';
import {
  REDEMPTION_STATUS,
  type PointHistoryEntry,
  type Redemption,
  type RewardItem,
} from '@/lib/api/student-life';

import { fmtKrw, fmtMonthDay, fmtPoints } from './format';
import { SkeletonCard, SkeletonRow } from './ui';

// 웹 학생 포털 /s/[token]/points (points-panel.tsx) 와 같은 카드·문구·배지 규칙.

const HISTORY_ICON: Record<PointHistoryEntry['kind'], { icon: LucideIcon; tone: Tone }> = {
  MERIT: { icon: TrendingUp, tone: 'brand' },
  DEMERIT: { icon: TrendingDown, tone: 'gray' },
  REDEMPTION: { icon: Gift, tone: 'gray' },
};

/** 내역이 길 때 처음에 보여줄 개수 (더 보기로 늘림) */
const HISTORY_PAGE = 30;

/** 잔액 */
export function BalanceCard({ balance, krw }: { balance: number; krw: number }) {
  return (
    <Section>
      <View style={s.balance}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="t4-medium" color="neutralMuted">
            내 포인트
          </Text>
          <Text variant="t12-bold" tabular style={{ marginTop: space.x1 }} accessibilityLabel={`내 포인트 ${fmtPoints(balance)}`}>
            {fmtPoints(balance)}
          </Text>
          <Text variant="t4-regular" color="neutralSubtle" tabular style={{ marginTop: space.x1 }}>
            {fmtKrw(krw)} 상당
          </Text>
        </View>
        <IconTile icon={Coins} tone="brand" size={48} round />
      </View>
    </Section>
  );
}

/** 기프티콘 상점 — 2칸(넓은 태블릿 3칸) 그리드 */
export function RewardShop({
  items,
  balance,
  toKrw,
  columns = 2,
  disabled,
  onRedeem,
}: {
  items: RewardItem[];
  balance: number;
  toKrw: (points: number) => number;
  columns?: number;
  disabled?: boolean;
  onRedeem: (item: RewardItem) => void;
}) {
  const rows: (RewardItem | null)[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    const row: (RewardItem | null)[] = items.slice(i, i + columns);
    while (row.length < columns) row.push(null);
    rows.push(row);
  }

  return (
    <Section title="기프티콘 상점" description="모은 포인트로 기프티콘을 받을 수 있어요">
      {items.length === 0 ? (
        <EmptyState icon={Gift} title="아직 등록된 상품이 없어요" style={{ paddingVertical: space.x6 }} />
      ) : (
        <View style={{ gap: space.x2 }}>
          {rows.map((row, ri) => (
            <View key={ri} style={s.shopRow}>
              {row.map((item, ci) =>
                item ? (
                  <RewardCard
                    key={item.id}
                    item={item}
                    affordable={balance >= item.points}
                    krw={toKrw(item.points)}
                    disabled={disabled}
                    onRedeem={() => onRedeem(item)}
                  />
                ) : (
                  <View key={`empty-${ci}`} style={{ flex: 1 }} />
                )
              )}
            </View>
          ))}
        </View>
      )}
    </Section>
  );
}

function RewardCard({
  item,
  affordable,
  krw,
  disabled,
  onRedeem,
}: {
  item: RewardItem;
  affordable: boolean;
  krw: number;
  disabled?: boolean;
  onRedeem: () => void;
}) {
  return (
    <View style={s.item}>
      <IconTile icon={Gift} tone="brand" size={40} style={{ backgroundColor: color.bg.layerDefault }} />
      <Text variant="t5-medium" numberOfLines={2} style={{ marginTop: space.x3 }}>
        {item.name}
      </Text>
      <Text variant="t5-bold" color="neutralMuted" tabular style={{ marginTop: space.x1 }}>
        {fmtPoints(item.points)}
      </Text>
      <Text variant="t2-regular" color="neutralSubtle" tabular>
        {fmtKrw(krw)}
      </Text>
      <View style={s.itemAction}>
        <Button
          size="sm"
          variant="weak"
          block
          disabled={!affordable || disabled}
          onPress={onRedeem}
          accessibilityLabel={affordable ? `${item.name} 교환하기` : `${item.name}, 포인트 부족`}>
          {affordable ? '교환하기' : '포인트 부족'}
        </Button>
      </View>
    </View>
  );
}

/** 내 신청 현황 — 신청이 있을 때만 */
export function MyRedemptions({ redemptions }: { redemptions: Redemption[] }) {
  if (redemptions.length === 0) return null;
  return (
    <Section title="내 신청 현황" flush>
      {redemptions.map((r) => {
        const st = REDEMPTION_STATUS[r.status];
        return (
          <ListRow
            key={r.id}
            leading={<IconTile icon={Gift} tone="gray" />}
            title={
              <Text variant="t5-medium" numberOfLines={1}>
                {r.itemName}
              </Text>
            }
            description={
              <View>
                <Text variant="t4-regular" color="neutralSubtle" tabular>
                  {fmtMonthDay(r.createdAt)} · {fmtPoints(r.points)}
                </Text>
                {r.status === 'REJECTED' && !!r.note && (
                  <Text variant="t4-regular" color="neutralMuted" style={{ marginTop: space.x0_5 }}>
                    {r.note}
                  </Text>
                )}
              </View>
            }
            trailing={<Badge tone={st.tone}>{st.label}</Badge>}
          />
        );
      })}
    </Section>
  );
}

/** 포인트 내역 — 상점·벌점·교환 통합, 최신순 */
export function PointHistory({ history }: { history: PointHistoryEntry[] }) {
  const [shown, setShown] = useState(HISTORY_PAGE);
  const visible = history.slice(0, shown);
  const rest = history.length - visible.length;

  return (
    <Section title="포인트 내역" flush>
      {history.length === 0 ? (
        <EmptyState icon={Coins} title="아직 포인트 내역이 없어요" style={{ paddingVertical: space.x8 }} />
      ) : (
        <>
          {visible.map((h, i) => {
            const plus = h.kind === 'MERIT';
            const isRedemption = h.kind === 'REDEMPTION';
            // 승인 전 교환은 아직 차감 전이라 흐리게
            const waiting = isRedemption && h.status === 'PENDING';
            const icon = HISTORY_ICON[h.kind];
            return (
              <ListRow
                key={i}
                leading={<IconTile icon={icon.icon} tone={icon.tone} />}
                title={
                  <Text variant="t5-medium" numberOfLines={1}>
                    {h.label}
                  </Text>
                }
                description={
                  <Text variant="t4-regular" color="neutralSubtle" tabular>
                    {fmtMonthDay(h.date)}
                    {isRedemption && h.status ? ` · ${REDEMPTION_STATUS[h.status].label}` : ''}
                  </Text>
                }
                trailing={
                  <Text
                    variant="t5-bold"
                    tabular
                    color={plus ? 'brand' : waiting ? 'neutralSubtle' : 'neutral'}
                    accessibilityLabel={`${plus ? '더하기' : '빼기'} ${fmtPoints(h.points)}`}>
                    {plus ? '+' : '−'}
                    {fmtPoints(h.points)}
                  </Text>
                }
              />
            );
          })}
          {rest > 0 && (
            <View style={s.more}>
              <Button variant="gray" size="md" block onPress={() => setShown((n) => n + HISTORY_PAGE)}>
                {`더 보기 (${rest.toLocaleString('ko-KR')})`}
              </Button>
            </View>
          )}
        </>
      )}
    </Section>
  );
}

/** 교환 확인 시트 — 선택 상품과 열림 상태를 분리해 닫히는 동안 내용이 비지 않게 */
export function RedeemSheet({
  item,
  open,
  pending,
  onClose,
  onSubmit,
}: {
  item: RewardItem | null;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (item: RewardItem) => void;
}) {
  return (
    <BottomSheet
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      dismissible={!pending}
      title={item ? `${item.name} 교환할까요?` : '교환할까요?'}
      description={
        item ? (
          <Text variant="t5-regular" color="neutralMuted">
            <Text variant="t5-bold" tabular>
              {fmtPoints(item.points)}
            </Text>
            을 사용해요. 선생님 승인 후 지급돼요.
          </Text>
        ) : undefined
      }
      footer={
        <>
          <Button variant="gray" size="xl" style={{ flex: 1 }} disabled={pending} onPress={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            size="xl"
            style={{ flex: 1 }}
            loading={pending}
            onPress={() => item && onSubmit(item)}>
            교환 신청
          </Button>
        </>
      }
    />
  );
}

export function PointsSkeleton({ tablet }: { tablet: boolean }) {
  const left = (
    <>
      <SkeletonCard gap={space.x2}>
        <Skeleton style={{ width: 64, height: 16 }} />
        <Skeleton style={{ width: 140, height: 36 }} />
        <Skeleton style={{ width: 110, height: 16 }} />
      </SkeletonCard>
      <SkeletonCard>
        <Skeleton style={{ width: 110, height: 22 }} />
        <Skeleton style={{ width: '70%', height: 16 }} />
        <View style={s.shopRow}>
          {[0, 1].map((i) => (
            <Skeleton key={i} style={{ flex: 1, height: 176, borderRadius: radius.r4 }} />
          ))}
        </View>
      </SkeletonCard>
    </>
  );
  const right = (
    <SkeletonCard gap={space.x5}>
      <Skeleton style={{ width: 90, height: 22 }} />
      {[0, 1, 2, 3].map((i) => (
        <SkeletonRow key={i} />
      ))}
    </SkeletonCard>
  );
  if (!tablet) {
    return (
      <Stack>
        {left}
        {right}
      </Stack>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 }}>
      <View style={{ flex: 1.25, gap: space.x3 }}>{left}</View>
      <View style={{ flex: 1, gap: space.x3 }}>{right}</View>
    </View>
  );
}

const s = StyleSheet.create({
  balance: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.x3 },
  shopRow: { flexDirection: 'row', alignItems: 'stretch', gap: space.x2 },
  item: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.r4,
    backgroundColor: color.bg.layerFill,
    padding: space.x4,
  },
  itemAction: { marginTop: 'auto', paddingTop: space.x3 },
  more: { paddingHorizontal: space.x5, paddingTop: space.x2, paddingBottom: space.x2 },
});
