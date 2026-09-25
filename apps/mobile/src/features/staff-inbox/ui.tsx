import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  CONTENT_MAX_WIDTH,
  CountBadge,
  Press,
  Skeleton,
  Text,
  color,
  radius,
  space,
} from '@/design';

/**
 * 소통 목록 한 줄 — 채팅 앱 규격: 아바타 · 이름(+보조) · 시각 / (제목) / 미리보기 · 안 읽음 / 배지 줄.
 * 태블릿 마스터-디테일에서 선택된 행은 옅은 회색 배경.
 */
export function InboxRow({
  leading,
  title,
  subtitle,
  time,
  headline,
  preview,
  unread = 0,
  meta,
  selected = false,
  onPress,
  accessibilityLabel,
}: {
  leading: ReactNode;
  title: string;
  subtitle?: string | null;
  time?: string | null;
  /** 두 번째 줄 굵은 제목 (질문 제목 등) */
  headline?: string | null;
  preview?: string | null;
  unread?: number;
  meta?: ReactNode;
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Press
      onPress={onPress}
      scale={0}
      pressedBg
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      style={[s.row, selected && s.rowSelected]}>
      {leading}
      <View style={s.body}>
        <View style={s.line}>
          <Text variant="t5-bold" numberOfLines={1} style={s.shrink}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1} style={s.shrink}>
              {subtitle}
            </Text>
          ) : null}
          {time ? (
            <Text variant="t3-regular" color="neutralSubtle" tabular style={s.time}>
              {time}
            </Text>
          ) : null}
        </View>
        {headline ? (
          <Text variant="t4-medium" numberOfLines={1}>
            {headline}
          </Text>
        ) : null}
        {preview != null || unread > 0 ? (
          <View style={s.line}>
            <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1} style={{ flex: 1 }}>
              {preview ?? ''}
            </Text>
            <CountBadge count={unread} />
          </View>
        ) : null}
        {meta != null ? <View style={s.meta}>{meta}</View> : null}
      </View>
    </Press>
  );
}

/** 탭 안쪽 목록 스크롤 — 당겨서 새로고침 + 폰에서는 웹과 같은 480 폭 */
export function PaneScroll({
  refreshing,
  onRefresh,
  children,
  maxWidth = CONTENT_MAX_WIDTH,
  contentStyle,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  children: ReactNode;
  maxWidth?: number;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={color.fg.neutralSubtle}
          colors={[color.fg.brand]}
        />
      }
      contentContainerStyle={s.paneContent}>
      <View style={[{ gap: space.x3, width: '100%', maxWidth: maxWidth || undefined, alignSelf: 'center' }, contentStyle]}>
        {children}
      </View>
    </ScrollView>
  );
}

/** 목록 첫 로드 스켈레톤 — 흰 카드 안 아바타 + 두 줄 */
export function InboxListSkeleton({ rows = 5, headline = false }: { rows?: number; headline?: boolean }) {
  return (
    <View style={s.skeletonCard} accessibilityLabel="불러오는 중">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={s.skeletonRow}>
          <Skeleton style={{ width: 40, height: 40, borderRadius: 20 }} />
          <View style={{ flex: 1, gap: space.x2 }}>
            <Skeleton style={{ width: '38%', height: 16 }} />
            {headline && <Skeleton style={{ width: '72%', height: 14 }} />}
            <Skeleton style={{ width: '88%', height: 14 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * 태블릿 TwoPane 오른쪽 상세 패널 틀 — 닫기(X) + 가운데 제목 · 본문 · 하단 고정 버튼.
 * (FullSheet inline 과 같은 모양이지만 화면 헤더 아래에 놓이므로 상단 safe-area 를 더하지 않는다.
 *  키보드 회피는 바깥 `Screen scroll={false}` 가 하므로 여기서는 하지 않는다)
 */
export function DetailPanel({
  title,
  onClose,
  right,
  footer,
  scroll = true,
  surface = 'canvas',
  refreshing = false,
  onRefresh,
  children,
}: {
  title: string;
  onClose?: () => void;
  right?: ReactNode;
  footer?: ReactNode;
  /** false 면 자식이 직접 레이아웃 (대화 화면 등) */
  scroll?: boolean;
  surface?: 'canvas' | 'panel';
  refreshing?: boolean;
  onRefresh?: () => void;
  children: ReactNode;
}) {
  const bg = surface === 'panel' ? color.bg.layerDefault : color.bg.layerBasement;
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <View style={s.panelHeader}>
        {onClose ? (
          <Press onPress={onClose} scale={0} pressedBg hitSlop={6} accessibilityLabel="닫기" style={s.panelClose}>
            <X color={color.fg.neutral} size={22} strokeWidth={2.1} />
          </Press>
        ) : null}
        <View pointerEvents="none" style={s.panelTitle}>
          <Text variant="t6-bold" numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        </View>
        <View style={s.panelRight}>{right}</View>
      </View>
      <View style={{ flex: 1 }}>
        {scroll ? (
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={color.fg.neutralSubtle}
                  colors={[color.fg.brand]}
                />
              ) : undefined
            }
            contentContainerStyle={{ padding: space.x4, paddingBottom: space.x8 }}>
            <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center' }}>{children}</View>
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{children}</View>
        )}
        {footer != null ? <View style={[s.panelFooter, { backgroundColor: bg }]}>{footer}</View> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  panelHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.x2,
    borderBottomWidth: 1,
    borderBottomColor: color.stroke.neutralSubtle,
  },
  panelClose: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { position: 'absolute', left: 64, right: 64, alignItems: 'center' },
  panelRight: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: space.x0_5 },
  panelFooter: {
    flexDirection: 'row',
    gap: space.x2,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
    borderTopWidth: 1,
    borderTopColor: color.stroke.neutralSubtle,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.x3,
    marginHorizontal: space.x2,
    paddingHorizontal: space.x3,
    paddingVertical: space.x3,
    borderRadius: radius.r4,
    minHeight: 64,
  },
  rowSelected: { backgroundColor: color.bg.neutralWeak },
  body: { flex: 1, minWidth: 0, gap: space.x0_5 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  shrink: { flexShrink: 1 },
  time: { marginLeft: 'auto', flexShrink: 0 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.x1, marginTop: space.x1 },
  paneContent: { paddingHorizontal: space.x4, paddingTop: space.x3, paddingBottom: space.x10 },
  skeletonCard: {
    backgroundColor: color.bg.layerDefault,
    borderRadius: radius.r5,
    paddingVertical: space.x2,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: space.x3,
    paddingHorizontal: space.x5,
    paddingVertical: space.x3,
  },
});

/** 에러 → 사용자 문구 */
export function errorText(e: unknown, fallback = '처리하지 못했어요. 잠시 후 다시 시도해 주세요.') {
  return e instanceof Error && e.message ? e.message : fallback;
}
