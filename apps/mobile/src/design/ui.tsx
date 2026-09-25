import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { Href } from 'expo-router';

import { Press } from './press';
import { Text } from './text';
import {
  color,
  radius,
  space,
  TONE_CALLOUT,
  TONE_SOFT,
  TONE_SOLID,
  type Tone,
} from './tokens';

// 웹 src/components/portal/ui.tsx 와 같은 이름·props 를 쓴다. (학생 앱 ↔ 매직링크 포털 동일 경험)

// ─── Badge ───────────────────────────────────────────────────────────

/** SEED Badge — weak(기본) / solid. size sm = medium(20px, t1) · md = large(24px, t2) */
export function Badge({
  tone = 'gray',
  solid = false,
  size = 'sm',
  children,
  style,
}: {
  tone?: Tone;
  solid?: boolean;
  size?: 'sm' | 'md';
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = solid ? TONE_SOLID[tone] : TONE_SOFT[tone];
  const md = size === 'md';
  return (
    <View
      style={[
        s.badge,
        {
          backgroundColor: c.bg,
          minHeight: md ? space.x6 : space.x5,
          paddingHorizontal: md ? space.x2 : space.x1_5,
          borderRadius: md ? radius.r1_5 : radius.r1,
        },
        style,
      ]}>
      <Text variant={md ? 't2-bold' : 't1-bold'} color={c.fg} tabular numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

/** 탭바·리스트용 숫자 알림 배지 */
export function CountBadge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  if (count <= 0) return null;
  return (
    <View style={[s.count, style]}>
      <Text variant="t1-bold" color="staticWhite" tabular>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

// ─── Icon tile ───────────────────────────────────────────────────────

const TILE = {
  32: { box: 32, r: radius.r2_5, icon: 16 },
  40: { box: 40, r: radius.r3, icon: 20 },
  44: { box: 44, r: radius.r3_5, icon: 22 },
  48: { box: 48, r: radius.r4, icon: 24 },
  56: { box: 56, r: radius.r5, icon: 28 },
  64: { box: 64, r: radius.r5, icon: 32 },
} as const;

export function IconTile({
  icon: Icon,
  tone = 'gray',
  solid = false,
  size = 40,
  round = false,
  style,
}: {
  icon: LucideIcon;
  tone?: Tone;
  solid?: boolean;
  size?: keyof typeof TILE;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = TILE[size];
  const c = solid ? TONE_SOLID[tone] : TONE_SOFT[tone];
  return (
    <View
      style={[
        s.center,
        {
          width: t.box,
          height: t.box,
          borderRadius: round ? t.box / 2 : t.r,
          backgroundColor: c.bg,
        },
        style,
      ]}>
      <Icon color={c.fg} size={t.icon} strokeWidth={2.2} />
    </View>
  );
}

// ─── Avatar (이니셜) ─────────────────────────────────────────────────

const AVATAR_TONES = [
  color.palette.carrot500,
  color.palette.green600,
  color.palette.blue600,
  color.palette.purple600,
  color.palette.yellow600,
  color.palette.red500,
];

export function avatarTone(name: string): string {
  const code = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_TONES[code % AVATAR_TONES.length];
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <View
      style={[
        s.center,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarTone(name) },
      ]}>
      <Text
        variant={size >= 56 ? 't7-bold' : size >= 40 ? 't5-bold' : 't3-bold'}
        color="staticWhite">
        {name.slice(0, 1)}
      </Text>
    </View>
  );
}

// ─── Section (흰 라운드 카드) ─────────────────────────────────────────

export function Section({
  title,
  description,
  action,
  flush = false,
  style,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** true 면 본문 패딩 없이 ListRow 를 바로 배치 */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const hasHeader = title != null || action != null;
  return (
    <View style={[s.section, style]}>
      {hasHeader && (
        <View style={[s.sectionHeader, { paddingBottom: flush ? space.x1 : space.x3 }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {title != null &&
              (typeof title === 'string' ? <Text variant="t6-bold">{title}</Text> : title)}
            {description != null &&
              (typeof description === 'string' ? (
                <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x0_5 }}>
                  {description}
                </Text>
              ) : (
                description
              ))}
          </View>
          {action}
        </View>
      )}
      {children != null &&
        (flush ? (
          <View style={{ paddingBottom: space.x2, paddingTop: hasHeader ? 0 : space.x2 }}>
            {children}
          </View>
        ) : (
          <View
            style={{
              paddingHorizontal: space.x5,
              paddingBottom: space.x5,
              paddingTop: hasHeader ? 0 : space.x5,
            }}>
            {children}
          </View>
        ))}
    </View>
  );
}

/** 섹션 헤더 우측 "전체 >" 텍스트 링크 */
export function SectionAction({
  href,
  onPress,
  children,
}: {
  href?: Href;
  onPress?: () => void;
  children: ReactNode;
}) {
  return (
    <Press href={href} onPress={onPress} scale={0} pressedBg style={s.sectionAction} hitSlop={8}>
      <Text variant="t4-medium" color="neutralSubtle">
        {children}
      </Text>
      <ChevronRight color={color.fg.neutralSubtle} size={16} strokeWidth={2.2} />
    </Press>
  );
}

/** 카드 밖 소제목 (날짜 그룹 등) */
export function GroupLabel({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <View style={s.groupLabel}>
      <Text variant="t4-bold" color="neutralMuted">
        {children}
      </Text>
      {trailing != null && (
        <Text variant="t3-regular" color="neutralSubtle" tabular>
          {trailing}
        </Text>
      )}
    </View>
  );
}

// ─── List row ────────────────────────────────────────────────────────
// SEED List Item 규격(prefix · title t5-medium · detail t4 subtle · suffix), 카드 안 인셋 눌림 영역.

export function ListRow({
  href,
  onPress,
  leading,
  title,
  description,
  meta,
  trailing,
  chevron,
  muted = false,
  align = 'center',
  style,
}: {
  href?: Href;
  onPress?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** 제목 위 작은 라벨 줄 (배지 등) */
  meta?: ReactNode;
  trailing?: ReactNode;
  /** 기본값: 누를 수 있으면 true */
  chevron?: boolean;
  muted?: boolean;
  align?: 'center' | 'start';
  style?: StyleProp<ViewStyle>;
}) {
  const interactive = !!href || !!onPress;
  const showChevron = chevron ?? interactive;
  const body = (
    <>
      {leading}
      <View style={s.rowBody}>
        {meta != null && <View style={s.rowMeta}>{meta}</View>}
        {typeof title === 'string' ? (
          <Text variant="t5-medium" color={muted ? 'neutralSubtle' : 'neutral'}>
            {title}
          </Text>
        ) : (
          title
        )}
        {description != null &&
          (typeof description === 'string' ? (
            <Text variant="t4-regular" color="neutralSubtle">
              {description}
            </Text>
          ) : (
            description
          ))}
      </View>
      {trailing != null && (
        <View style={s.rowTrailing}>
          {typeof trailing === 'string' ? (
            <Text variant="t4-regular" color="neutralSubtle">
              {trailing}
            </Text>
          ) : (
            trailing
          )}
        </View>
      )}
      {showChevron && <ChevronRight color={color.fg.neutralSubtle} size={18} strokeWidth={2} />}
    </>
  );
  const rowStyle = [s.row, { alignItems: align === 'start' ? 'flex-start' : 'center' } as const, style];
  if (!interactive) return <View style={rowStyle}>{body}</View>;
  return (
    <Press href={href} onPress={onPress} scale={0} pressedBg style={rowStyle}>
      {body}
    </Press>
  );
}

/** 라벨 — 값 형태의 정보 줄 (상세 화면용) */
export function InfoRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <View style={s.infoRow}>
      {typeof label === 'string' ? (
        <Text variant="t5-regular" color="neutralSubtle">
          {label}
        </Text>
      ) : (
        label
      )}
      <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
        {typeof children === 'string' || typeof children === 'number' ? (
          <Text variant="t5-medium" align="right">
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

// ─── Stat grid ───────────────────────────────────────────────────────

const STAT_TONE = {
  neutral: color.fg.neutral,
  brand: color.fg.brand,
  positive: color.fg.positive,
  warning: color.fg.warning,
  critical: color.fg.critical,
  informative: color.fg.informative,
} as const;

/** 요약 숫자 칸 — 라벨 위, 값 아래, 칸 사이 세로 구분선 */
export function StatGrid({
  items,
  surface = 'fill',
  style,
}: {
  items: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: keyof typeof STAT_TONE }[];
  surface?: 'fill' | 'plain';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.statGrid, surface === 'fill' && s.statFill, style]}>
      {items.map((it, i) => (
        <Fragment key={i}>
          {i > 0 && <View style={s.statDivider} />}
          <View style={s.statCell}>
            <Text variant="t3-regular" color="neutralSubtle" align="center">
              {it.label}
            </Text>
            <Text variant="t6-bold" color={STAT_TONE[it.tone ?? 'neutral']} tabular align="center">
              {it.value}
            </Text>
            {it.sub != null && (
              <Text variant="t2-regular" color="neutralSubtle" align="center">
                {it.sub}
              </Text>
            )}
          </View>
        </Fragment>
      ))}
    </View>
  );
}

// ─── Buttons (SEED ActionButton) ─────────────────────────────────────

export type ButtonVariant = 'primary' | 'weak' | 'gray' | 'dark' | 'danger' | 'ghost';
export type ButtonSize = 'xl' | 'lg' | 'md' | 'sm' | 'xs';

const BTN_VARIANT: Record<ButtonVariant, { bg: string; fg: string; pressed: string }> = {
  primary: { bg: color.bg.brandSolid, fg: color.palette.staticWhite, pressed: color.bg.brandSolidPressed },
  weak: { bg: color.bg.neutralWeak, fg: color.fg.neutral, pressed: color.bg.neutralWeakPressed },
  gray: { bg: color.bg.neutralWeak, fg: color.fg.neutral, pressed: color.bg.neutralWeakPressed },
  dark: { bg: color.bg.neutralInverted, fg: color.fg.neutralInverted, pressed: color.bg.neutralInvertedPressed },
  danger: { bg: color.bg.criticalSolid, fg: color.palette.staticWhite, pressed: color.bg.criticalSolidPressed },
  ghost: { bg: 'transparent', fg: color.fg.neutral, pressed: color.bg.transparentPressed },
};

// SEED 규격: xsmall 32(full, t3) · small 36(r2, t4) · medium 40(r2, t4) · large 52(r3, t6)
const BTN_SIZE = {
  xl: { h: 52, r: radius.r3, px: space.x5, gap: space.x2, text: 't6-bold', icon: 22 },
  lg: { h: 52, r: radius.r3, px: space.x5, gap: space.x2, text: 't6-bold', icon: 22 },
  md: { h: 40, r: radius.r2, px: space.x4, gap: space.x1_5, text: 't4-bold', icon: 18 },
  sm: { h: 36, r: radius.r2, px: space.x3_5, gap: space.x1, text: 't4-bold', icon: 16 },
  xs: { h: 32, r: radius.full, px: space.x3_5, gap: space.x1, text: 't3-bold', icon: 14 },
} as const;

export function Button({
  variant = 'primary',
  size = 'lg',
  block = false,
  loading = false,
  disabled = false,
  icon: Icon,
  iconRight: IconRight,
  onPress,
  href,
  children,
  style,
  accessibilityLabel,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  onPress?: () => void;
  href?: Href;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const v = BTN_VARIANT[variant];
  const z = BTN_SIZE[size];
  const off = disabled && !loading;
  const fg = off ? color.fg.disabled : v.fg;
  const iconOnly = children == null;
  return (
    <Press
      href={href}
      onPress={loading || disabled ? undefined : onPress}
      disabled={disabled || loading}
      pressedBg={v.pressed}
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={[
        s.btn,
        {
          height: z.h,
          minWidth: iconOnly ? z.h : undefined,
          borderRadius: z.r,
          paddingHorizontal: iconOnly ? 0 : z.px,
          gap: z.gap,
          backgroundColor: off ? color.bg.disabled : v.bg,
          alignSelf: block ? 'stretch' : 'auto',
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {Icon && <Icon color={fg} size={z.icon} strokeWidth={2.2} />}
          {children != null &&
            (typeof children === 'string' ? (
              <Text variant={z.text} color={fg} numberOfLines={1}>
                {children}
              </Text>
            ) : (
              children
            ))}
          {IconRight && <IconRight color={fg} size={z.icon} strokeWidth={2.2} />}
        </>
      )}
    </Press>
  );
}

// ─── Notice (SEED Callout) ───────────────────────────────────────────

export function Notice({
  tone = 'gray',
  icon: Icon,
  title,
  children,
  onPress,
  style,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = TONE_CALLOUT[tone];
  const body = (
    <>
      {Icon && <Icon color={c.fg} size={18} strokeWidth={2.2} style={{ marginTop: 1 }} />}
      <Text variant="t4-regular" color={c.fg} style={{ flex: 1 }}>
        {title != null && (
          <Text variant="t4-bold" color={c.fg}>
            {title}
            {children != null ? '  ' : ''}
          </Text>
        )}
        {children}
      </Text>
      {onPress && <ChevronRight color={c.fg} size={18} strokeWidth={2.2} />}
    </>
  );
  const st = [s.callout, { backgroundColor: c.bg }, style];
  return onPress ? (
    <Press onPress={onPress} style={st}>
      {body}
    </Press>
  ) : (
    <View style={st}>{body}</View>
  );
}

// ─── Chip (SEED Chip outlineStrong) ──────────────────────────────────

export function Chip({
  selected,
  onPress,
  children,
  size = 'md',
  disabled,
  icon: Icon,
}: {
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  icon?: LucideIcon;
}) {
  const h = size === 'lg' ? 40 : size === 'md' ? 36 : 32;
  const fg = selected ? color.fg.neutralInverted : color.fg.neutral;
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      pressedBg={selected ? color.bg.neutralInvertedPressed : color.bg.transparentPressed}
      style={[
        s.chip,
        {
          height: h,
          paddingHorizontal: size === 'lg' ? space.x4 : size === 'md' ? space.x3_5 : space.x3,
          backgroundColor: selected ? color.bg.neutralInverted : 'transparent',
          borderColor: selected ? color.bg.neutralInverted : color.stroke.neutralMuted,
          opacity: disabled ? 0.5 : 1,
        },
      ]}>
      {Icon && <Icon color={fg} size={16} strokeWidth={2.2} />}
      {typeof children === 'string' ? (
        <Text variant="t4-medium" color={fg} numberOfLines={1}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Press>
  );
}

/** 가로 스크롤 없는 칩 묶음 (줄바꿈) */
export function ChipGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 }, style]}>{children}</View>;
}

// ─── Segmented (SEED SegmentedControl) ───────────────────────────────

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  style,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.segmented, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Press
            key={o.value}
            onPress={() => onChange(o.value)}
            disabled={disabled}
            scale={0}
            accessibilityRole="tab"
            accessibilityState={{ selected: on, disabled }}
            style={[s.segItem, on && s.segItemOn]}>
            {typeof o.label === 'string' ? (
              <Text
                variant={on ? 't5-bold' : 't5-medium'}
                color={disabled ? 'disabled' : on ? 'neutral' : 'neutralSubtle'}
                numberOfLines={1}>
                {o.label}
              </Text>
            ) : (
              o.label
            )}
          </Press>
        );
      })}
    </View>
  );
}

/** 밑줄 탭 (SEED Tabs, fill) — 목록 필터·화면 내 탭 */
export function SegmentTabs<T extends string>({
  tabs,
  value,
  onChange,
  scrollable,
  style,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  /** 가로 스크롤 (탭이 많을 때). 기본: 5개 이상이면 켜짐 */
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const scroll = scrollable ?? tabs.length >= 5;
  // SEED Tabs: 탭이 많으면 medium(t4, 40) — 폭이 좁아도 한 줄에 들어가게
  const dense = tabs.length >= 4;
  const items = tabs.map((t) => {
    const on = t.value === value;
    return (
      <Press
        key={t.value}
        onPress={() => onChange(t.value)}
        scale={0}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        style={[s.tab, dense && { minHeight: 40, paddingHorizontal: space.x1_5 }, scroll && s.tabScroll]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x1 }}>
          <Text
            variant={dense ? (on ? 't4-bold' : 't4-medium') : on ? 't5-bold' : 't5-medium'}
            color={on ? 'neutral' : 'neutralSubtle'}
            numberOfLines={1}>
            {t.label}
          </Text>
          {t.count != null && t.count > 0 && (
            <Text variant={dense ? 't3-bold' : 't4-bold'} color={on ? 'brand' : 'neutralSubtle'} tabular>
              {t.count}
            </Text>
          )}
        </View>
        {on && <View style={s.tabIndicator} />}
      </Press>
    );
  });
  if (!scroll) {
    return (
      <View style={[s.tabs, style]} accessibilityRole="tablist">
        {items}
      </View>
    );
  }
  return (
    <View style={[s.tabs, style]} accessibilityRole="tablist">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.x1 }}>
        {items}
      </ScrollView>
    </View>
  );
}

// ─── Feedback ────────────────────────────────────────────────────────

/** 빈 화면 — SEED ResultSection 규격 */
export function EmptyState({
  icon,
  tone = 'gray',
  title,
  description,
  action,
  style,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title: string;
  description?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.empty, style]}>
      <IconTile icon={icon} tone={tone} size={56} round />
      <View style={{ marginTop: space.x4, gap: space.x2, alignItems: 'center' }}>
        <Text variant="t5-bold" align="center">
          {title}
        </Text>
        {description != null && (
          <Text variant="t4-regular" color="neutralSubtle" align="center">
            {description}
          </Text>
        )}
      </View>
      {action != null && <View style={{ marginTop: space.x6 }}>{action}</View>}
    </View>
  );
}

export function ProgressBar({
  value,
  tone = 'brand',
  style,
}: {
  value: number;
  tone?: 'brand' | 'ok' | 'ink';
  style?: StyleProp<ViewStyle>;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * 100);
  const [w] = useState(() => new Animated.Value(pct));
  useEffect(() => {
    Animated.timing(w, { toValue: pct, duration: 300, useNativeDriver: false }).start();
  }, [pct, w]);
  return (
    <View
      style={[s.progress, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <Animated.View
        style={{
          height: '100%',
          borderRadius: radius.full,
          backgroundColor:
            tone === 'brand' ? color.bg.brandSolid : tone === 'ok' ? color.bg.positiveSolid : color.bg.neutralSolid,
          width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

/** SEED Skeleton — 부드럽게 깜빡이는 회색 블록 */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const [o] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={[s.skeleton, { opacity: o }, style]} />;
}

export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.divider, { marginHorizontal: inset }, style]} />;
}

/** 전체 화면 로딩 (첫 로드) */
export function LoadingState({ label }: { label?: string }) {
  return (
    <View style={s.stateBox}>
      <ActivityIndicator color={color.fg.neutralSubtle} />
      {label != null && (
        <Text variant="t4-regular" color="neutralSubtle">
          {label}
        </Text>
      )}
    </View>
  );
}

/** 불러오기 실패 */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={s.stateBox}>
      <Text variant="t5-bold" align="center">
        불러오지 못했어요
      </Text>
      <Text variant="t4-regular" color="neutralSubtle" align="center">
        {message ?? '네트워크 상태를 확인하고 다시 시도해 주세요.'}
      </Text>
      {onRetry && (
        <Button variant="gray" size="sm" onPress={onRetry} style={{ marginTop: space.x2 }}>
          다시 시도
        </Button>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  badge: { alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  count: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: color.bg.brandSolid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { backgroundColor: color.bg.layerDefault, borderRadius: radius.r5 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    paddingHorizontal: space.x5,
    paddingTop: space.x5,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: -space.x1_5,
    paddingHorizontal: space.x1_5,
    paddingVertical: space.x1,
    borderRadius: radius.r2,
  },
  groupLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.x1,
    paddingBottom: space.x2,
    paddingTop: space.x1,
  },
  row: {
    flexDirection: 'row',
    gap: space.x3,
    marginHorizontal: space.x2,
    paddingHorizontal: space.x3,
    paddingVertical: space.x3,
    borderRadius: radius.r4,
  },
  rowBody: { flex: 1, minWidth: 0, gap: space.x0_5 },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.x1, marginBottom: space.x0_5 },
  rowTrailing: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5, flexShrink: 0 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.x4,
    paddingVertical: space.x2,
  },
  statGrid: { flexDirection: 'row', alignItems: 'stretch' },
  statFill: { backgroundColor: color.bg.layerFill, borderRadius: radius.r4, paddingVertical: space.x4 },
  statDivider: { width: 1, backgroundColor: color.stroke.neutralSubtle },
  statCell: { flex: 1, minWidth: 0, alignItems: 'center', gap: space.x1, paddingHorizontal: space.x2 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  callout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.x3,
    minHeight: 50,
    padding: space.x3_5,
    borderRadius: radius.r2_5,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x1,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  segmented: {
    flexDirection: 'row',
    padding: space.x1,
    borderRadius: radius.full,
    backgroundColor: color.bg.neutralWeakAlpha,
  },
  segItem: {
    flex: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x3,
    paddingVertical: space.x1_5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segItemOn: {
    backgroundColor: color.palette.gray00,
    borderColor: color.stroke.neutralMuted,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: color.stroke.neutralSubtle,
  },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.x2_5 },
  tabScroll: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', paddingHorizontal: space.x3 },
  tabIndicator: {
    position: 'absolute',
    left: space.x2_5,
    right: space.x2_5,
    bottom: -1,
    height: 2,
    backgroundColor: color.fg.neutral,
  },
  empty: { alignItems: 'center', paddingHorizontal: space.x6, paddingVertical: space.x12 },
  progress: {
    height: space.x2,
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius.full,
    backgroundColor: color.bg.neutralWeak,
  },
  skeleton: { backgroundColor: color.bg.neutralWeak, borderRadius: radius.r2 },
  divider: { height: 1, backgroundColor: color.stroke.neutralSubtle },
  stateBox: { alignItems: 'center', justifyContent: 'center', gap: space.x2, paddingVertical: space.x16 },
});

