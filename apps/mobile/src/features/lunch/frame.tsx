import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  color,
  radius,
  Screen,
  Section,
  Skeleton,
  space,
  Stack,
  TABLET_WIDE,
  Text,
  useResponsive,
} from '@/design';
import { ChildChips } from '@/lib/parent-child';

import type { LunchFrameConfig, LunchOrderState } from './adapter';
import { won, ymdLabel, type LunchView } from './format';

/** 도시락 화면 틀 — 뒤로가기 헤더 + (학부모) 자녀 칩 + 본문 + 하단 CTA */
export function LunchFrame({
  frame,
  children,
  footer,
  refreshing,
  onRefresh,
  onBack,
  surface = 'canvas',
  wide = false,
}: {
  frame: LunchFrameConfig;
  children: ReactNode;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** 헤더 뒤로가기 동작 바꾸기 (수정 중 → 이전 화면) */
  onBack?: () => void;
  /** 신청(폼) 화면은 흰 바탕 */
  surface?: 'canvas' | 'panel';
  /** 태블릿 두 단(Columns) 화면 */
  wide?: boolean;
}) {
  const { isTablet } = useResponsive();
  return (
    <Screen
      kind="push"
      title="점심 도시락"
      backFallback={frame.backFallback}
      onBack={onBack}
      footer={footer}
      surface={surface}
      refreshing={refreshing}
      onRefresh={onRefresh}
      // 폰 480(기본) · 태블릿 720(기본), 두 단 화면은 1040
      maxWidth={isTablet && wide ? TABLET_WIDE : undefined}>
      <Stack>
        {frame.childSwitcher && <ChildChips />}
        {children}
      </Stack>
    </Screen>
  );
}

const INTRO: Record<LunchView, string> = {
  order: '주차를 고르고 먹을 날짜를 선택해 신청해 주세요.',
  payment: '아래 계좌로 입금한 뒤 ‘입금했어요’를 눌러 주세요.',
  confirmed: '신청이 확정됐어요. 내역을 확인해 주세요.',
};

/** 화면 맨 위 상태 줄 — 웹 폼 머리글(배지 + 안내 문구)과 같은 문구 */
export function LunchIntro({
  view,
  title,
  depositClaimed,
}: {
  view: LunchView;
  /** 학부모 "홍길동 학생" · 학생 "내 도시락" */
  title: string;
  depositClaimed?: boolean;
}) {
  return (
    <View style={s.intro}>
      <View style={s.introRow}>
        <Text variant="t6-bold" numberOfLines={1} style={{ flexShrink: 1 }}>
          {title}
        </Text>
        {view === 'payment' && (
          <Badge tone="warn" size="md">
            {depositClaimed ? '입금 확인 중' : '입금 대기'}
          </Badge>
        )}
        {view === 'confirmed' && (
          <Badge tone="ok" size="md">
            신청 확정
          </Badge>
        )}
      </View>
      <Text variant="t5-regular" color="neutralMuted">
        {INTRO[view]}
      </Text>
    </View>
  );
}

/** 신청 내역 카드 — 날짜별 메뉴·금액 + 합계 */
export function LunchOrderSummary({
  order,
  totalLabel,
  footer,
}: {
  order: LunchOrderState;
  totalLabel: string;
  footer?: ReactNode;
}) {
  return (
    <Section title={`신청 내역 ${order.items.length}일`}>
      {/* 날짜 · 메뉴 · 금액 한 줄 — 여러 날을 신청해도 한눈에 */}
      <View>
        {order.items.map((it, i) => (
          <View key={it.date} style={[s.line, i > 0 && s.lineDivider]}>
            <Text variant="t5-medium" tabular style={{ width: 92 }}>
              {ymdLabel(it.date).replace(/^(\d+)월 (\d+)일/, '$1/$2')}
            </Text>
            <Text variant="t4-regular" color="neutralMuted" numberOfLines={1} style={{ flex: 1 }}>
              {it.name.replace(/,(?=\S)/g, ', ')}
            </Text>
            <Text variant="t5-medium" color="neutralMuted" tabular>
              {won(it.price)}
            </Text>
          </View>
        ))}
      </View>
      <View style={s.total}>
        <Text variant="t5-medium" color="neutralMuted">
          {totalLabel}
        </Text>
        <Text variant="t8-bold" tabular>
          {won(order.total)}
        </Text>
      </View>
      {footer != null && <View style={{ marginTop: space.x4 }}>{footer}</View>}
    </Section>
  );
}

export function LunchSkeleton() {
  return (
    <Stack>
      <View style={[s.intro, { gap: space.x2 }]}>
        <Skeleton style={{ width: 120, height: 22 }} />
        <Skeleton style={{ width: '80%', height: 18 }} />
      </View>
      <View style={s.card}>
        <Skeleton style={{ width: 72, height: 16 }} />
        <View style={{ flexDirection: 'row', gap: space.x2 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ width: 96, height: 40, borderRadius: radius.full }} />
          ))}
        </View>
      </View>
      <View style={s.card}>
        <Skeleton style={{ alignSelf: 'center', width: 120, height: 24 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} style={{ height: 68, borderRadius: radius.r4 }} />
        ))}
      </View>
    </Stack>
  );
}

const s = StyleSheet.create({
  intro: { paddingHorizontal: space.x1, paddingTop: space.x2, paddingBottom: space.x1, gap: space.x1_5 },
  introRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.x2, minHeight: 44, paddingVertical: space.x2 },
  lineDivider: { borderTopWidth: 1, borderTopColor: color.stroke.neutralSubtle },
  total: {
    marginTop: space.x4,
    paddingTop: space.x4,
    borderTopWidth: 1,
    borderTopColor: color.stroke.neutralSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: color.bg.layerDefault,
    borderRadius: radius.r5,
    padding: space.x5,
    gap: space.x3,
  },
});
