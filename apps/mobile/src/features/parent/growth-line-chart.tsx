import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { color, radius, shadow, space, Text } from '@/design';

// 성장 탭 추이 차트 — 한 계열 꺾은선 (범례 없음: 섹션 제목이 계열 이름).
// 2px 선 · 지름 8px 점(흰 테두리 2px) · 옅은 가로 격자 · 선택한 점(기본: 가장 최근)에 값 말풍선.
// 점마다 세로 전체가 누름 영역(44pt 이상)이라 손가락으로 쉽게 고를 수 있다.

export type ChartPoint = {
  key: string;
  /** x 축 짧은 라벨 ("9.24") */
  label: string;
  value: number;
  /** 말풍선 윗줄 (시험 이름 등) */
  caption: string;
};

const PAD = { left: 30, right: 16, top: 56, bottom: 26 };
const LINE = color.palette.carrot600;
const GRID = color.palette.gray300;
const BUBBLE_W = 148;

export function GrowthLineChart({
  points,
  domain,
  ticks,
  invert = false,
  formatValue,
  formatTick = (v) => String(v),
  height = 208,
  accessibilityLabel,
}: {
  /** 오래된 → 최근 */
  points: ChartPoint[];
  domain: [number, number];
  ticks: number[];
  /** true 면 작은 값이 위 (등급: 1등급이 맨 위) */
  invert?: boolean;
  formatValue: (v: number) => string;
  formatTick?: (v: number) => string;
  height?: number;
  accessibilityLabel: string;
}) {
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const n = points.length;
  // 고른 점 (자녀·과목이 바뀌어 없어졌으면 가장 최근 점)
  const sel = points.find((p) => p.key === picked) ?? points[n - 1];

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };

  const [min, max] = domain;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => {
    const t = max === min ? 0.5 : (v - min) / (max - min);
    return PAD.top + (invert ? t : 1 - t) * plotH;
  };

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ');

  // x 라벨 — 많으면 건너뛰되 처음·마지막은 항상
  const step = n <= 6 ? 1 : Math.ceil(n / 5);
  const showLabel = (i: number) => i === 0 || i === n - 1 || (i % step === 0 && n - 1 - i >= step);

  const selI = sel ? points.indexOf(sel) : -1;
  const sx = selI >= 0 ? x(selI) : 0;
  const bubbleLeft = Math.min(Math.max(sx - BUBBLE_W / 2, 0), Math.max(0, width - BUBBLE_W));
  const colW = n <= 1 ? plotW : plotW / (n - 1);

  return (
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
                  {formatTick(t)}
                </SvgText>
              ))}
              {sel && (
                <Line
                  x1={sx}
                  x2={sx}
                  y1={PAD.top - 8}
                  y2={PAD.top + plotH}
                  stroke={color.palette.gray400}
                  strokeWidth={1}
                />
              )}
              {n > 1 && (
                <Path
                  d={path}
                  stroke={LINE}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fill="none"
                />
              )}
              {points.map((p, i) => (
                <Circle
                  key={p.key}
                  cx={x(i)}
                  cy={y(p.value)}
                  r={p === sel ? 6 : 4}
                  fill={LINE}
                  stroke={color.bg.layerDefault}
                  strokeWidth={2}
                />
              ))}
              {points.map((p, i) =>
                showLabel(i) ? (
                  <SvgText
                    key={`x${p.key}`}
                    x={x(i)}
                    y={height - 6}
                    fontSize={11}
                    fill={p === sel ? color.fg.neutral : color.fg.neutralSubtle}
                    fontWeight={p === sel ? '700' : '400'}
                    textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'}>
                    {p.label}
                  </SvgText>
                ) : null
              )}
            </Svg>
          </View>

          {sel && (
            <View pointerEvents="none" style={[s.bubble, { left: bubbleLeft }]}>
              <Text variant="t2-regular" color="neutralSubtle" numberOfLines={1}>
                {sel.caption}
              </Text>
              <Text variant="t5-bold" tabular numberOfLines={1}>
                {formatValue(sel.value)}
              </Text>
            </View>
          )}

          {/* 점 고르기 — 점마다 세로 기둥 전체가 누름 영역 */}
          {points.map((p, i) => (
            <Pressable
              key={`h${p.key}`}
              onPress={() => setPicked(p.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: p === sel }}
              accessibilityLabel={`${p.caption}, ${p.label}, ${formatValue(p.value)}`}
              style={{
                position: 'absolute',
                top: PAD.top - 12,
                bottom: 0,
                left: Math.max(0, x(i) - Math.max(colW, 44) / 2),
                width: Math.max(colW, 44),
              }}
            />
          ))}
        </>
      )}
    </View>
  );
}

/** 등급 축 범위 — 데이터 앞뒤로 1등급씩 여유, 1~9 안 */
export function gradeDomain(values: number[]): { domain: [number, number]; ticks: number[] } {
  let lo = Math.max(1, Math.floor(Math.min(...values)) - 1);
  let hi = Math.min(9, Math.ceil(Math.max(...values)) + 1);
  while (hi - lo < 2) {
    if (lo > 1) lo -= 1;
    else if (hi < 9) hi += 1;
    else break;
  }
  const stepBy = hi - lo > 4 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += stepBy) ticks.push(t);
  return { domain: [lo, hi], ticks };
}

/** 점수(0~100) 축 범위 — 최저점 아래 10점 단위까지 */
export function scoreDomain(values: number[]): { domain: [number, number]; ticks: number[] } {
  const raw = Math.max(0, Math.min(80, Math.floor((Math.min(...values) - 5) / 10) * 10));
  const stepBy = 100 - raw > 60 ? 25 : 100 - raw > 30 ? 10 : 5;
  const lo = Math.floor(raw / stepBy) * stepBy;
  const ticks: number[] = [];
  for (let t = 100; t >= lo; t -= stepBy) ticks.push(t);
  return { domain: [lo, 100], ticks };
}

const s = StyleSheet.create({
  bubble: {
    position: 'absolute',
    top: 0,
    width: BUBBLE_W,
    paddingHorizontal: space.x3,
    paddingVertical: space.x1_5,
    borderRadius: radius.r2,
    backgroundColor: color.bg.layerFloating,
    borderWidth: 1,
    borderColor: color.stroke.neutralSubtle,
    alignItems: 'center',
    ...shadow('s1'),
  },
});
