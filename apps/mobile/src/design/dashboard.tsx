import type { Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Children, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useResponsive } from '@/lib/responsive';

import { Press } from './press';
import { Text, type FgColor } from './text';
import { color, radius, space, type Tone } from './tokens';
import { IconTile, Section, Skeleton } from './ui';

/**
 * 태블릿 홈 대시보드 부품 — 폰 홈은 기존 Section 스택 그대로, 태블릿(가로)에서만 쓴다.
 *   <Screen kind="home" maxWidth={DASHBOARD_MAX_WIDTH}>
 *     <DashboardHeader eyebrow="원장님, 좋은 아침이에요" title="처리할 일이 2건 있어요" subtitle="10월 27일 화요일" />
 *     <KpiRow>{<KpiTile …/> × 4}</KpiRow>
 *     <DashGrid>
 *       <DashCol flex={1.4}>{Section…}</DashCol>
 *       <DashCol>{Section…}</DashCol>
 *     </DashGrid>
 *   </Screen>
 * 색·글자·반경은 SEED 토큰만 쓴다(카드 = Section 과 같은 흰 바탕 r5).
 */

/** 대시보드 본문 최대 폭 — 13형 iPad 가로(사이드바 제외 ~1110)까지 꽉 채우고 그 이상은 가운데 */
export const DASHBOARD_MAX_WIDTH = 1240;

export function DashboardHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={s.header}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow != null && (
          <Text variant="t5-medium" color="neutralSubtle">
            {eyebrow}
          </Text>
        )}
        <Text variant="t12-bold" accessibilityRole="header" style={{ marginTop: space.x1 }}>
          {title}
        </Text>
        {subtitle != null && (
          <Text variant="t5-regular" color="neutralSubtle" style={{ marginTop: space.x1_5 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

const KPI_FG = {
  neutral: 'neutral',
  brand: 'brand',
  positive: 'positive',
  critical: 'critical',
  warning: 'warning',
  informative: 'informative',
} as const satisfies Record<string, FgColor>;

/** 큰 숫자 타일 — 라벨(+아이콘) 위, 값 크게, 보조 설명 아래. href/onPress 가 있으면 눌러서 이동 */
export function KpiTile({
  label,
  value,
  unit,
  caption,
  tone = 'neutral',
  icon,
  iconTone = 'gray',
  href,
  onPress,
  style,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  caption?: ReactNode;
  tone?: keyof typeof KPI_FG;
  icon?: LucideIcon;
  iconTone?: Tone;
  href?: Href;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const body = (
    <>
      <View style={s.kpiLabel}>
        {icon && <IconTile icon={icon} tone={iconTone} size={32} />}
        <Text variant="t4-medium" color="neutralMuted" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
      </View>
      <View style={s.kpiValue}>
        <Text variant="t13-bold" color={KPI_FG[tone]} tabular numberOfLines={1}>
          {value}
        </Text>
        {unit != null && (
          <Text variant="t5-bold" color="neutralSubtle">
            {unit}
          </Text>
        )}
      </View>
      {caption != null &&
        (typeof caption === 'string' ? (
          <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1}>
            {caption}
          </Text>
        ) : (
          caption
        ))}
    </>
  );
  if (href || onPress) {
    return (
      <Press
        href={href}
        onPress={onPress}
        accessibilityLabel={`${label} ${typeof value === 'string' || typeof value === 'number' ? value : ''}${unit ?? ''}`}
        style={[s.kpi, style]}>
        {body}
      </Press>
    );
  }
  return <View style={[s.kpi, style]}>{body}</View>;
}

/** 타일 하나가 이보다 좁아지면(세로 iPad 등) 두 개씩 줄을 나눈다 */
const KPI_MIN_WIDTH = 190;

/** KpiTile 을 같은 폭으로 한 줄에 — 좁은 화면에서는 2개씩 */
export function KpiRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { contentWidth } = useResponsive();
  const items = Children.toArray(children);
  const avail = Math.min(contentWidth, DASHBOARD_MAX_WIDTH) - space.x6 * 2;
  const perRow = items.length > 2 && avail / items.length < KPI_MIN_WIDTH ? 2 : items.length;
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  return (
    <View style={[{ gap: space.x3 }, style]}>
      {rows.map((row, i) => (
        <View key={i} style={[s.row, { alignItems: 'stretch' }]}>
          {row}
        </View>
      ))}
    </View>
  );
}

/** 대시보드 칸 나누기 — DashCol 을 가로로 놓는다 */
export function DashGrid({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.row, { alignItems: 'flex-start' }, style]}>{children}</View>;
}

/** 대시보드 한 칸 — 카드들을 세로로 쌓는다. flex 로 폭 비율 */
export function DashCol({
  flex = 1,
  children,
  style,
}: {
  flex?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ flex, minWidth: 0, gap: space.x3 }, style]}>{children}</View>;
}

/** 태블릿 홈 로딩 뼈대 — 헤더 · KPI 타일 · 칸들 */
export function DashboardSkeleton({ kpis = 4, columns = 2 }: { kpis?: number; columns?: number }) {
  return (
    <View style={{ gap: space.x3 }}>
      <View style={[s.header, { flexDirection: 'column', alignItems: 'flex-start', gap: space.x2 }]}>
        <Skeleton style={{ width: 180, height: 18 }} />
        <Skeleton style={{ width: 340, height: 36 }} />
        <Skeleton style={{ width: 140, height: 18 }} />
      </View>
      {kpis > 0 && (
        <KpiRow>
          {Array.from({ length: kpis }, (_, i) => (
            <View key={i} style={s.kpi}>
              <Skeleton style={{ width: 90, height: 18 }} />
              <Skeleton style={{ width: 72, height: 44 }} />
            </View>
          ))}
        </KpiRow>
      )}
      <DashGrid>
        {Array.from({ length: columns }, (_, c) => (
          <DashCol key={c} flex={c === 0 ? 1.4 : 1}>
            {Array.from({ length: c === 0 ? 2 : 1 }, (_, i) => (
              <Section key={i}>
                <View style={{ gap: space.x4 }}>
                  <Skeleton style={{ width: 120, height: 22 }} />
                  {Array.from({ length: 3 }, (_, r) => (
                    <View key={r} style={{ flexDirection: 'row', gap: space.x3, alignItems: 'center' }}>
                      <Skeleton style={{ width: 40, height: 40, borderRadius: radius.r3 }} />
                      <View style={{ flex: 1, gap: space.x1_5 }}>
                        <Skeleton style={{ width: '60%', height: 16 }} />
                        <Skeleton style={{ width: '40%', height: 13 }} />
                      </View>
                    </View>
                  ))}
                </View>
              </Section>
            ))}
          </DashCol>
        ))}
      </DashGrid>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.x4,
    paddingHorizontal: space.x1,
    paddingTop: space.x2,
    paddingBottom: space.x5,
  },
  row: { flexDirection: 'row', gap: space.x3 },
  kpi: {
    flex: 1,
    minWidth: 0,
    backgroundColor: color.bg.layerDefault,
    borderRadius: radius.r5,
    padding: space.x5,
    gap: space.x3,
  },
  kpiLabel: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  kpiValue: { flexDirection: 'row', alignItems: 'baseline', gap: space.x1 },
});
