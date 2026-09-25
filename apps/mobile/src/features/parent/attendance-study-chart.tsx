import { Minus, TrendingDown, TrendingUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { Text, color, space } from '@/design';
import type { ParentStudyStatsResponse } from '@/lib/api/parent-today';

import { WEEKDAYS, compareText, duration } from './today-format';

// 하루 공부 시간 막대 그래프 (한 계열) — dataviz 규격: 막대 ≤24px · 위쪽만 4px 둥글게 · 기준선에서 자람 ·
// 옅은 1px 가로 격자 · 선택한 막대만 강조색 + 값은 그래프 위 한 줄로(막대마다 숫자 X).

type Day = ParentStudyStatsResponse['days'][number];

const BAR_ON = color.bg.brandSolid;
const BAR_OFF = color.palette.gray600;
const GRID = color.stroke.neutralSubtle;
const REF = color.fg.neutralMuted;

function niceStep(maxMinutes: number): number {
  const hours = maxMinutes / 60;
  for (const step of [1, 2, 3, 4, 6]) if (hours / step <= 4) return step * 60;
  return 8 * 60;
}

function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  const b = y + h;
  return `M${x},${b}L${x},${y + rr}Q${x},${y} ${x + rr},${y}L${x + w - rr},${y}Q${x + w},${y} ${x + w},${y + rr}L${x + w},${b}Z`;
}

export function StudyBars({
  days,
  mode,
  selected,
  onSelect,
  referenceMinutes,
  compact = false,
  height,
}: {
  days: Day[];
  mode: 'week' | 'month';
  /** 강조할 막대 (없으면 오늘) */
  selected?: string | null;
  onSelect?: (date: string) => void;
  /** 가로 기준선 — 같은 학년 하루 평균 */
  referenceMinutes?: number | null;
  /** 홈 미니 그래프: 축·기준선 없이 */
  compact?: boolean;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };

  const plotH = height ?? (compact ? 88 : 168);
  const axisW = compact ? 0 : 40;
  // 기준선이 잘리지 않게 1px 위로
  const base = plotH - 1;
  const top = compact ? 4 : 12;
  const innerW = Math.max(0, width - axisW);
  const n = Math.max(1, days.length);
  const slot = innerW / n;
  const barW = Math.max(2, Math.min(mode === 'week' ? 24 : 12, slot - 2, slot * (mode === 'week' ? 0.55 : 0.72)));

  const ref = !compact && referenceMinutes && referenceMinutes > 0 ? referenceMinutes : null;
  const dataMax = Math.max(0, ...days.map((d) => d.minutes), ref ?? 0);
  const step = niceStep(Math.max(dataMax, 60));
  const yMax = Math.max(step, Math.ceil(dataMax / step) * step);
  const y = (min: number) => top + (base - top) * (1 - min / yMax);
  const ticks: number[] = [];
  for (let t = 0; t <= yMax; t += step) ticks.push(t);

  const highlight = selected ?? days.find((d) => d.today)?.date ?? null;

  const summary = days
    .filter((d) => !d.future)
    .map((d) => `${mode === 'week' ? WEEKDAYS[d.weekday] : `${Number(d.date.slice(8))}일`} ${duration(d.minutes)}`)
    .join(', ');

  return (
    <View
      onLayout={onLayout}
      accessible={!onSelect}
      accessibilityLabel={`하루 공부 시간 막대 그래프. ${summary}`}>
      <View style={{ height: plotH }}>
        {width > 0 && (
          <Svg width={width} height={plotH}>
            {!compact &&
              ticks.map((t) => (
                <Line
                  key={t}
                  x1={axisW}
                  x2={width}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={t === 0 ? color.stroke.neutralWeak : GRID}
                  strokeWidth={1}
                />
              ))}
            {compact && (
              <Line x1={0} x2={width} y1={base} y2={base} stroke={color.stroke.neutralWeak} strokeWidth={1} />
            )}
            {!compact &&
              ticks
                .filter((t) => t > 0)
                .map((t) => (
                  <SvgText
                    key={`l${t}`}
                    x={0}
                    y={y(t) + 4}
                    fontSize={11}
                    fill={color.fg.neutralSubtle}>
                    {`${t / 60}시간`}
                  </SvgText>
                ))}
            {days.map((d, i) => {
              if (d.future || d.minutes <= 0) return null;
              const x = axisW + slot * i + (slot - barW) / 2;
              const h = Math.max(2, base - y(d.minutes));
              return (
                <Path
                  key={d.date}
                  d={barPath(x, base - h, barW, h, 4)}
                  fill={d.date === highlight ? BAR_ON : BAR_OFF}
                />
              );
            })}
            {ref != null && (
              <Line
                x1={axisW}
                x2={width}
                y1={y(ref)}
                y2={y(ref)}
                stroke={REF}
                strokeWidth={1.5}
              />
            )}
          </Svg>
        )}
        {/* 누름 영역 — 막대보다 넓게(칸 전체) */}
        {onSelect && width > 0 && (
          <View style={[StyleSheet.absoluteFill, { left: axisW, flexDirection: 'row' }]}>
            {days.map((d) => (
              <Pressable
                key={d.date}
                disabled={d.future}
                onPress={() => onSelect(d.date)}
                accessibilityRole="button"
                accessibilityState={{ selected: d.date === highlight, disabled: d.future }}
                accessibilityLabel={`${Number(d.date.slice(5, 7))}월 ${Number(d.date.slice(8))}일 ${
                  d.future ? '아직 오지 않은 날' : duration(d.minutes)
                }`}
                style={{ flex: 1 }}
              />
            ))}
          </View>
        )}
      </View>
      {/* x축 라벨 — 글자 확대를 따르도록 RN Text 로 */}
      <View style={[s.labels, { paddingLeft: axisW }]}>
        {days.map((d, i) => {
          const dayNum = Number(d.date.slice(8));
          const show = mode === 'week' || dayNum === 1 || (dayNum - 1) % 7 === 0 || i === days.length - 1;
          const on = d.date === highlight;
          return (
            <View key={d.date} style={{ flex: 1, alignItems: 'center' }}>
              {show && (
                <Text
                  variant={on ? 't3-bold' : 't3-regular'}
                  color={on ? 'neutral' : d.future ? 'placeholder' : 'neutralSubtle'}
                  numberOfLines={1}
                  style={mode === 'month' ? s.monthLabel : undefined}>
                  {mode === 'week' ? (d.today ? '오늘' : WEEKDAYS[d.weekday]) : `${dayNum}`}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  compare: { flexDirection: 'row', alignItems: 'center', gap: space.x1 },
  labels: { flexDirection: 'row', marginTop: space.x1_5 },
  monthLabel: { width: 28, textAlign: 'center' },
});

// ─── 합계 + 지난 기간 비교 ───────────────────────────────────────────

/** 큰 합계 숫자 + "지난주 이맘때보다 1시간 더 했어요" */
export function StudySummary({
  stats,
  label,
  size = 'lg',
}: {
  stats: ParentStudyStatsResponse;
  label: string;
  size?: 'md' | 'lg';
}) {
  const prevWord = stats.range === 'week' ? '지난주' : '지난달';
  const base = stats.inProgress ? stats.previous.comparableMinutes : stats.previous.totalMinutes;
  const cmp = compareText(stats.totalMinutes - base);
  const hasCompare = base > 0 || stats.totalMinutes > 0;
  const Icon = cmp.direction === 'up' ? TrendingUp : cmp.direction === 'down' ? TrendingDown : Minus;
  const tint = cmp.direction === 'up' ? color.fg.positive : color.fg.neutralMuted;
  const sentence =
    base === 0
      ? `${prevWord}에는 공부 기록이 없었어요`
      : `${prevWord}${stats.inProgress ? ' 이맘때' : ''}보다 ${cmp.text}`;

  return (
    <View style={{ gap: space.x1 }} accessible accessibilityLabel={`${label} ${duration(stats.totalMinutes)}. ${hasCompare ? sentence : ''}`}>
      <Text variant="t4-medium" color="neutralSubtle">
        {label}
      </Text>
      <Text variant={size === 'lg' ? 't11-bold' : 't9-bold'}>{duration(stats.totalMinutes)}</Text>
      {hasCompare && (
        <View style={s.compare}>
          {base > 0 && <Icon color={tint} size={18} strokeWidth={2.2} />}
          <Text variant="t4-medium" color={cmp.direction === 'up' && base > 0 ? 'positive' : 'neutralMuted'} style={{ flexShrink: 1 }}>
            {sentence}
          </Text>
        </View>
      )}
    </View>
  );
}
