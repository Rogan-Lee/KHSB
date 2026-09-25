import { useRouter } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import { Children, createContext, useContext, useState, type ReactNode } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Press } from './press';
import { Text } from './text';
import { useResponsive } from '@/lib/responsive';

import { color, CONTENT_MAX_WIDTH, space } from './tokens';

/**
 * 화면 틀 — 웹 학생 포털 PortalShell 과 같은 구조.
 *  · kind="home": 로고 + "강한선배"
 *  · kind="tab":  좌측 큰 제목(screen-title) — 탭 루트
 *  · kind="push": 뒤로가기 + 가운데 제목 — 하위 화면 (탭바 없음)
 *  · kind="modal": 닫기(X) + 가운데 제목 — 시트형 전체 화면
 * surface: canvas(회색 바탕 + 흰 카드) / panel(흰 바탕 — 폼·글 읽기)
 */

export const TAB_BAR_HEIGHT = 60;
/** 태블릿 한 단 본문 폭 */
export const TABLET_CONTENT_WIDTH = 720;
/** 태블릿 두 단(Columns) 화면 폭 — Screen maxWidth 로 넘긴다 */
export const TABLET_WIDE = 1040;

type ScreenKind = 'home' | 'tab' | 'push' | 'modal';

/** 탭 루트 화면 안인지 (하단 탭바만큼 여백) — 탭 레이아웃이 제공 */
export const InTabsContext = createContext(false);

export type ScreenProps = {
  kind?: ScreenKind;
  title?: string;
  /** 헤더 오른쪽 (아이콘 버튼 등) */
  right?: ReactNode;
  surface?: 'canvas' | 'panel';
  /** 뒤로가기 동작 (기본 router.back, 히스토리 없으면 fallback) */
  onBack?: () => void;
  backFallback?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** 하단 고정 CTA (BottomCTA 내용) */
  footer?: ReactNode;
  /** 본문 폭 제한 (기본 480 — 웹 포털과 동일). 0 이면 제한 없음 */
  maxWidth?: number;
  /** 스크롤 없이 자식이 직접 레이아웃 (채팅·TwoPane 등) */
  scroll?: boolean;
  /** 본문 좌우 여백 (기본 x4) */
  gutter?: number;
  contentStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function Screen({
  kind = 'push',
  title,
  right,
  surface = 'canvas',
  onBack,
  backFallback,
  refreshing = false,
  onRefresh,
  footer,
  maxWidth: maxWidthProp,
  scroll = true,
  gutter = space.x4,
  contentStyle,
  children,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const maxWidth = maxWidthProp ?? (isTablet ? TABLET_CONTENT_WIDTH : CONTENT_MAX_WIDTH);
  const inTabs = useContext(InTabsContext) && (kind === 'home' || kind === 'tab');
  const [scrolled, setScrolled] = useState(false);
  const [footerH, setFooterH] = useState(0);
  const bg = surface === 'panel' ? color.bg.layerDefault : color.bg.layerBasement;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y > 4 !== scrolled) setScrolled(y > 4);
  };

  const bottomPad = footer
    ? footerH
    : inTabs
      ? space.x8
      : Math.max(insets.bottom, space.x4) + space.x6;

  const width = maxWidth ? { maxWidth, width: '100%' as const, alignSelf: 'center' as const } : null;

  return (
    <View style={[s.root, { backgroundColor: bg }]}>
      <ScreenHeader
        kind={kind}
        title={title}
        right={right}
        onBack={onBack}
        backFallback={backFallback}
        scrolled={scrolled}
        background={bg}
        maxWidth={maxWidth}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
        keyboardVerticalOffset={0}>
        {scroll ? (
          <ScrollView
            onScroll={onScroll}
            scrollEventThrottle={32}
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
            contentContainerStyle={[
              { paddingHorizontal: gutter, paddingTop: space.x1, paddingBottom: bottomPad },
            ]}>
            <View style={[width, contentStyle]}>{children}</View>
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
        )}
        {footer != null && (
          <BottomCTA background={bg} onHeight={setFooterH} maxWidth={maxWidth}>
            {footer}
          </BottomCTA>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

/** 카드들을 간격 x3 으로 쌓는 기본 스택 (웹 flex-col gap-x3) */
export function Stack({
  gap = space.x3,
  children,
  style,
}: {
  gap?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

/**
 * 태블릿에서는 두 칸(왼쪽 넓게), 폰에서는 위아래로 쌓는다.
 * 태블릿 두 칸 화면은 Screen maxWidth={isTablet ? TABLET_WIDE : undefined} 와 함께 쓴다.
 */
export function Columns({
  left,
  right,
  gap = space.x3,
  leftFlex = 1.25,
}: {
  left: ReactNode;
  right: ReactNode;
  gap?: number;
  leftFlex?: number;
}) {
  const { isTablet } = useResponsive();
  if (!isTablet) {
    return (
      <View style={{ gap }}>
        {left}
        {right}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap }}>
      <View style={{ flex: leftFlex, minWidth: 0, gap }}>{left}</View>
      <View style={{ flex: 1, minWidth: 0, gap }}>{right}</View>
    </View>
  );
}

// ─── Header ──────────────────────────────────────────────────────────

export function ScreenHeader({
  kind,
  title,
  right,
  onBack,
  backFallback,
  scrolled = false,
  background = color.bg.layerBasement,
  maxWidth = CONTENT_MAX_WIDTH,
}: {
  kind: ScreenKind;
  title?: string;
  right?: ReactNode;
  onBack?: () => void;
  backFallback?: string;
  scrolled?: boolean;
  background?: string;
  maxWidth?: number;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const back = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else if (backFallback) router.replace(backFallback as never);
  };

  return (
    <View
      style={[
        s.header,
        {
          paddingTop: insets.top,
          backgroundColor: background,
          borderBottomColor: scrolled ? color.stroke.neutralSubtle : 'transparent',
        },
      ]}>
      <View style={[s.headerRow, maxWidth ? { maxWidth, width: '100%', alignSelf: 'center' } : null]}>
        {kind === 'home' && (
          <View style={s.brand} accessibilityRole="header">
            <Image source={require('@/assets/images/icon.png')} style={s.logo} />
            <Text variant="t7-bold">강한선배</Text>
          </View>
        )}
        {kind === 'tab' && (
          <Text variant="screen-title" accessibilityRole="header" style={{ paddingHorizontal: space.x3 }}>
            {title}
          </Text>
        )}
        {(kind === 'push' || kind === 'modal') && (
          <>
            <Press
              onPress={back}
              scale={0}
              pressedBg
              hitSlop={6}
              accessibilityLabel={kind === 'modal' ? '닫기' : '뒤로 가기'}
              style={s.backBtn}>
              {kind === 'modal' ? (
                <X color={color.fg.neutral} size={24} strokeWidth={2.1} />
              ) : (
                <ChevronLeft color={color.fg.neutral} size={26} strokeWidth={2.1} />
              )}
            </Press>
            <View pointerEvents="none" style={s.centerTitle}>
              <Text variant="t6-bold" numberOfLines={1} accessibilityRole="header">
                {title}
              </Text>
            </View>
          </>
        )}
        <View style={s.headerRight}>{right}</View>
      </View>
    </View>
  );
}

/** 헤더 오른쪽 아이콘 버튼 (알림 등) — 40px 원형 눌림 영역 + 선택적 점 배지 */
export function HeaderIconButton({
  icon: Icon,
  onPress,
  href,
  label,
  dot = false,
}: {
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  onPress?: () => void;
  href?: string;
  label: string;
  dot?: boolean;
}) {
  return (
    <Press
      onPress={onPress}
      href={href as never}
      scale={0}
      pressedBg
      accessibilityLabel={label}
      style={s.iconBtn}>
      <Icon color={color.fg.neutral} size={24} strokeWidth={1.9} />
      {dot && <View style={s.dot} />}
    </Press>
  );
}

// ─── Bottom CTA ──────────────────────────────────────────────────────

/** 화면 하단 고정 CTA — 위로 옅어지는 바탕(그라데이션) + safe-area. Screen footer 로 쓰는 것을 권장 */
export function BottomCTA({
  children,
  note,
  background = color.bg.layerBasement,
  onHeight,
  maxWidth = CONTENT_MAX_WIDTH,
}: {
  children: ReactNode;
  note?: ReactNode;
  background?: string;
  onHeight?: (h: number) => void;
  maxWidth?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={s.cta}
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}>
      <Svg height={space.x6} width="100%" style={{ position: 'absolute', top: 0 }} pointerEvents="none">
        <Defs>
          <LinearGradient id="cta-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={background} stopOpacity="0" />
            <Stop offset="1" stopColor={background} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#cta-fade)" />
      </Svg>
      <View
        style={{
          marginTop: space.x6,
          backgroundColor: background,
          paddingHorizontal: space.x4,
          paddingBottom: Math.max(insets.bottom, space.x3),
        }}>
        <View style={[{ gap: space.x2_5 }, maxWidth ? { maxWidth, width: '100%', alignSelf: 'center' } : null]}>
          {note != null &&
            (typeof note === 'string' ? (
              <Text variant="t3-regular" color="neutralSubtle" align="center">
                {note}
              </Text>
            ) : (
              note
            ))}
          {/* 버튼들이 폭을 똑같이 나눠 갖는다 (웹 BottomCTA 의 flex gap-x2) */}
          <View style={s.ctaRow}>
            {Children.toArray(children).map((child, i) => (
              <View key={i} style={{ flex: 1, minWidth: 0 }}>
                {child}
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: 1, zIndex: 10 },
  headerRow: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.x2 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.x2, paddingHorizontal: space.x3 },
  logo: { width: 28, height: 28, borderRadius: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  centerTitle: { position: 'absolute', left: 64, right: 64, alignItems: 'center' },
  headerRight: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: space.x0_5 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.bg.brandSolid,
    borderWidth: 1.5,
    borderColor: color.bg.layerDefault,
  },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  ctaRow: { flexDirection: 'row', gap: space.x2 },
});
