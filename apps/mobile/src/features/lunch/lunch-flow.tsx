import { useState } from 'react';

import { ErrorState } from '@/design';
import { refreshBadges } from '@/lib/badges';

import type { LunchAdapter, LunchQuery } from './adapter';
import { LunchConfirmedView } from './confirmed-view';
import { deriveLunchView, type LunchView } from './format';
import { LunchFrame, LunchSkeleton } from './frame';
import { LunchOrderView } from './order-view';
import { LunchPaymentView } from './payment-view';

/**
 * 도시락 신청 흐름 — 웹 lunch-order-form(학생 포털 /s/[token]/lunch · 학부모 /meal/[token] 공용)의 네이티브판.
 * 신청(주차·요일 선택) → 입금 안내(계좌 복사·"입금했어요") → 확정(변경 요청 스레드).
 * 학부모·학생 화면이 조회 결과(query)와 역할별 어댑터만 바꿔 끼운다.
 */
export function LunchFlow({ adapter, query }: { adapter: LunchAdapter; query: LunchQuery }) {
  // 수정·추가 신청으로 잠깐 다른 화면을 보는 중 (대상이 바뀌면 무효)
  const [override, setOverride] = useState<{ key: string; view: LunchView } | null>(null);

  const data = query.data;
  if (!data || query.isLoading) {
    return (
      <LunchFrame frame={adapter}>
        {query.error ? <ErrorState message={query.error} onRetry={() => void query.retry()} /> : <LunchSkeleton />}
      </LunchFrame>
    );
  }

  const derived = deriveLunchView(data);
  const view = override?.key === adapter.key ? override.view : derived;
  const reset = () => setOverride(null);
  const after = () => {
    reset();
    refreshBadges();
    void query.refresh();
  };
  const common = {
    adapter,
    data,
    refreshing: query.isRefreshing,
    onRefresh: () => void query.refresh(),
  };

  if (view === 'payment' && data.pending) {
    return (
      <LunchPaymentView
        {...common}
        onClaimed={after}
        onEdit={() => setOverride({ key: adapter.key, view: 'order' })}
      />
    );
  }
  if (view === 'confirmed' && data.confirmed) {
    return (
      <LunchConfirmedView
        {...common}
        onSent={() => void query.refresh()}
        onOrderMore={() => setOverride({ key: adapter.key, view: 'order' })}
      />
    );
  }
  return (
    <LunchOrderView
      // 서버 신청 내역이 바뀌면 선택 상태를 새로 잡는다
      key={`${adapter.key}:${data.pendingMenuIds.join(',')}`}
      {...common}
      onSaved={after}
      onBack={derived !== 'order' ? reset : undefined}
    />
  );
}
