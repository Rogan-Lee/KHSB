import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { color, radius, space, Text } from '@/design';

// 월간 리포트 성적 추이 — 여러 계열 꺾은선 (GrowthLineChart 와 같은 문법: 2px 선 · 지름 8px 점 + 흰 테두리 2px ·
// 옅은 가로 격자 · 점마다 세로 기둥 전체가 누름 영역). 여러 계열이라 말풍선 대신 차트 아래에 고른 칸의 값을 모두 보여 준다.

export type TrendSeries = { key: string; label: string; color: string };

export type TrendColumn = {
  key: string;
  /** x 축 짧은 라벨 ("9/3") */
  label: string;
  /** 아래 읽기 칸 제목 (시험 이름) */
  title: string;
  /** 아래 읽기 칸 보조 줄 (날짜) */
  sub: string;
  values: Record<string, number>;
};

const PAD = { left: 30, right: 14, top: 14, bottom: 26 };
const GRID = color.palette.gray300;

export function MonthlyTrendChart({
  columns,
  series,
  domain,
  ticks,
  invert = false,
  reference,
  formatValue,
  emphasize = false,
  height = 232,
  accessibilityLabel,
}: {
  /** 오래된 → 최근 */
  columns: TrendColumn[];
  series: TrendSeries[];
  domain: [number, number];
  ticks: number[];
  /** true 면 작은 값이 위 (등급) */
  invert?: boolean;
  /** 점선 기준선 (예: 3등급) */
  reference?: { value: number; label: string };
  formatValue: (v: number) => string;
  /** 계열 하나만 볼 때 선을 굵게 */
  emphasize?: boolean;
  height?: number;
  accessibilityLabel: string;
}) {
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const n = columns.length;
  const sel = columns.find((c) => c.key === picked) ?? columns[n - 1];
  const selI = sel ? columns.indexOf(sel) : -1;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };

  const [min, max] = domain;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => {
    const t = max === min ? 0.5 : (Math.min(max, Math.max(min, v)) - min) / (max - min);
    return PAD.top + (invert ? t : 1 - t) * plotH;
  };

  // x 라벨 — 많으면 건너뛰되 처음·마지막은 항상
  const step = n <= 6 ? 1 : Math.ceil(n / 5);
  const showLabel = (i: number) => i === 0 || i === n - 1 || (i % step === 0 && n - 1 - i >= step);
  const colW = n <= 1 ? plotW : plotW / (n - 1);
  const lineW = emphasize ? 3 : 2;
  const dotR = emphasize ? 5 : 4;

  const readout = sel
    ? series.flatMap((s) => (sel.values[s.key] != null ? [{ ...s, value: sel.values[s.key] }] : []))
    : [];

  return (
    <View style={{ gap: space.x3 }}>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 && (
          <>
            <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
              <Svg width={width} height={height}>
                {ticks.map((t) => (
                  <Line
                    key={`g${t}`}
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={y(t)}
                    y2={y(t)}
                    stroke={GRID}
                    strokeWidth={1}
                  />
                ))}
                {ticks.map((t) => (
                  <SvgText
                    key={`t${t}`}
                    x={PAD.left - 8}
                    y={y(t) + 4}
                    fontSize={11}
                    fill={color.fg.neutralSubtle}
                    textAnchor="end">
                    {String(t)}
                  </SvgText>
                ))}
                {reference && (
                  <>
                    <Line
                      x1={PAD.left}
                      x2={width - PAD.right}
                      y1={y(reference.value)}
                      y2={y(reference.value)}
                      stroke={color.palette.gray600}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                    <SvgText
                      x={width - PAD.right}
                      y={y(reference.value) + (invert ? 14 : -5)}
                      fontSize={11}
                      fill={color.fg.neutralSubtle}
                      textAnchor="end">
                      {reference.label}
                    </SvgText>
                  </>
                )}
                {sel && (
                  <Line
                    x1={x(selI)}
                    x2={x(selI)}
                    y1={PAD.top - 6}
                    y2={PAD.top + plotH}
                    stroke={color.palette.gray400}
                    strokeWidth={1}
                  />
                )}
                {series.map((s) => {
                  // 값이 빈 칸은 건너뛰고 이어 그린다 (웹 connectNulls)
                  const pts = columns.flatMap((c, i) =>
                    c.values[s.key] != null ? [{ i, v: c.values[s.key] }] : []
                  );
                  if (pts.length < 2) return null;
                  const d = pts
                    .map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`)
                    .join(' ');
                  return (
                    <Path
                      key={`l${s.key}`}
                      d={d}
                      stroke={s.color}
                      strokeWidth={lineW}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      fill="none"
                    />
                  );
                })}
                {series.map((s) =>
                  columns.map((c, i) =>
                    c.values[s.key] != null ? (
                      <Circle
                        key={`d${s.key}-${c.key}`}
                        cx={x(i)}
                        cy={y(c.values[s.key])}
                        r={c === sel ? dotR + 2 : dotR}
                        fill={s.color}
                        stroke={color.bg.layerDefault}
                        strokeWidth={2}
                      />
                    ) : null
                  )
                )}
                {columns.map((c, i) =>
                  showLabel(i) ? (
                    <SvgText
                      key={`x${c.key}`}
                      x={x(i)}
                      y={height - 6}
                      fontSize={11}
                      fill={c === sel ? color.fg.neutral : color.fg.neutralSubtle}
                      fontWeight={c === sel ? '700' : '400'}
                      textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'}>
                      {c.label}
                    </SvgText>
                  ) : null
                )}
              </Svg>
            </View>

            {/* 칸 고르기 — 칸마다 세로 기둥 전체가 누름 영역 (44pt 이상) */}
            {columns.map((c, i) => (
              <Pressable
                key={`h${c.key}`}
                onPress={() => setPicked(c.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: c === sel }}
                accessibilityLabel={`${c.title}, ${c.sub}, ${series
                  .filter((s) => c.values[s.key] != null)
                  .map((s) => `${s.label} ${formatValue(c.values[s.key])}`)
                  .join(', ')}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: Math.max(0, x(i) - Math.max(colW, 44) / 2),
                  width: Math.max(colW, 44),
                }}
              />
            ))}
          </>
        )}
      </View>

      {sel && readout.length > 0 && (
        <View style={s.readout} accessibilityLiveRegion="polite">
          <View style={{ gap: space.x0_5 }}>
            <Text variant="t4-bold" numberOfLines={2}>
              {sel.title}
            </Text>
            <Text variant="t3-regular" color="neutralSubtle" tabular>
              {sel.sub}
            </Text>
          </View>
          <View style={{ gap: space.x1_5, marginTop: space.x2_5 }}>
            {readout.map((r) => (
              <View key={r.key} style={s.readoutRow}>
                <View style={[s.dot, { backgroundColor: r.color }]} />
                <Text variant="t4-regular" color="neutralMuted" numberOfLines={1} style={{ flex: 1 }}>
                  {r.label}
                </Text>
                <Text variant="t4-bold" tabular>
                  {formatValue(r.value)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

/** 계열 색 점 (범례·칩·읽기 칸 공용) */
export function SeriesDot({ color: c }: { color: string }) {
  return <View style={[s.dot, { backgroundColor: c }]} />;
}

const s = StyleSheet.create({
  readout: {
    borderRadius: radius.r3,
    backgroundColor: color.bg.layerFill,
    paddingHorizontal: space.x3_5,
    paddingVertical: space.x3,
  },
  readoutRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  dot: { width: space.x2, height: space.x2, borderRadius: space.x1 },
});
