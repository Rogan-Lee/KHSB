import { useRef, useState } from 'react';

import { Columns, ErrorState, Screen, TABLET_WIDE, toast, useResponsive } from '@/design';
import {
  BalanceCard,
  MyRedemptions,
  PointHistory,
  PointsSkeleton,
  RedeemSheet,
  RewardShop,
} from '@/features/student-life/points-sections';
import {
  POINTS_PATH,
  pointsToKrw,
  requestRedemption,
  type RewardItem,
  type StudentPointsResponse,
} from '@/lib/api/student-life';
import { useMobileQuery } from '@/lib/mobile-api';

// 학생 포인트 — 웹 포털 /s/[token]/points 와 같은 구성:
// 잔액 → 기프티콘 상점 → 내 신청 현황 → 포인트 내역 (+ 교환 확인 바텀시트).
// 태블릿: 왼쪽(잔액·상점·신청 현황) | 오른쪽(포인트 내역).

export default function StudentPointsScreen() {
  const { isTablet, width } = useResponsive();
  const { data, error, isRefreshing, refresh, retry } = useMobileQuery<StudentPointsResponse>(POINTS_PATH);

  // 시트가 닫히는 애니메이션 동안 내용이 비지 않도록 선택 상품과 열림 상태를 분리 (웹과 동일)
  const [confirmItem, setConfirmItem] = useState<RewardItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  const submit = async (item: RewardItem) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await requestRedemption(item.id);
      toast(`"${item.name}" 교환을 신청했어요`, 'success');
      setSheetOpen(false);
      void refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : '신청 실패', 'error');
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const per = data?.pointsPer10000Krw ?? 0;
  const toKrw = (points: number) => pointsToKrw(points, per);

  return (
    <>
      <Screen
        kind="push"
        title="포인트"
        backFallback="/(student)/(tabs)/menu"
        maxWidth={isTablet ? TABLET_WIDE : undefined}
        refreshing={isRefreshing}
        onRefresh={data ? () => void refresh() : undefined}>
        {!data ? (
          error ? (
            <ErrorState message={error} onRetry={() => void retry()} />
          ) : (
            <PointsSkeleton tablet={isTablet} />
          )
        ) : (
          <Columns
            left={
              <>
                <BalanceCard balance={data.balance} krw={toKrw(data.balance)} />
                <RewardShop
                  items={data.items}
                  balance={data.balance}
                  toKrw={toKrw}
                  columns={isTablet && width >= 900 ? 3 : 2}
                  disabled={pending}
                  onRedeem={(item) => {
                    setConfirmItem(item);
                    setSheetOpen(true);
                  }}
                />
                <MyRedemptions redemptions={data.myRedemptions} />
              </>
            }
            right={<PointHistory history={data.history} />}
          />
        )}
      </Screen>

      <RedeemSheet
        item={confirmItem}
        open={sheetOpen}
        pending={pending}
        onClose={() => setSheetOpen(false)}
        onSubmit={(item) => void submit(item)}
      />
    </>
  );
}
