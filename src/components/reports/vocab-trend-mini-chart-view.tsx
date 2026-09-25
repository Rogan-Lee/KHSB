"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipPayloadEntry,
} from "recharts";

interface Datum {
  date: string;
  isoDate: string;
  score: number;
  correctWords: number;
  totalWords: number;
}

interface Props {
  data: Datum[];
}

// SEED 토큰 — 학부모 리포트(ReportShell, light-only) 안에서 SVG 속성에 CSS 변수로 사용
const COLOR = {
  line: "var(--seed-color-fg-brand)",
  grid: "var(--seed-color-stroke-neutral-subtle)",
  axisLine: "var(--seed-color-stroke-neutral-weak)",
  tick: "var(--seed-color-fg-neutral-subtle)",
  surface: "var(--seed-color-bg-layer-default)",
};

/** "2026-09-03" → "9/3" */
function shortDate(iso: unknown): string {
  const [, m, d] = String(iso ?? "").split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : String(iso ?? "");
}

/** "2026-09-03" → "9월 3일" */
function longDate(iso: unknown): string {
  const [, m, d] = String(iso ?? "").split("-");
  return m && d ? `${Number(m)}월 ${Number(d)}일` : String(iso ?? "");
}

/**
 * 영단어 학습 추이 라인 차트(클라이언트). 부모 서버 컴포넌트가 데이터 정제까지 처리.
 * X = testDate (월/일), Y = 정답률(%) 0~100.
 */
export function VocabTrendMiniChartView({ data }: Props) {
  const gradientId = `vocab-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR.line} stopOpacity={0.18} />
              <stop offset="100%" stopColor={COLOR.line} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={COLOR.grid} vertical={false} />
          <XAxis
            dataKey="isoDate"
            fontSize={12}
            tick={{ fill: COLOR.tick }}
            tickFormatter={shortDate}
            tickLine={false}
            axisLine={{ stroke: COLOR.axisLine }}
            tickMargin={8}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            fontSize={12}
            tick={{ fill: COLOR.tick }}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            cursor={{ stroke: COLOR.axisLine, strokeWidth: 1 }}
            content={({ active, payload }) => <VocabTooltip active={active} payload={payload} />}
          />
          <Area
            type="monotone"
            dataKey="score"
            name="정답률"
            stroke={COLOR.line}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={{ r: 4, fill: COLOR.line, strokeWidth: 2, stroke: COLOR.surface }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: COLOR.surface }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function VocabTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipPayloadEntry>;
}) {
  const p = payload?.[0]?.payload as Datum | undefined;
  if (!active || !p) return null;
  return (
    <div className="rounded-r3 bg-bg-layer-floating px-x3 py-x2_5 shadow-s2">
      <p className="t3-bold text-fg-neutral">{longDate(p.isoDate)}</p>
      <p className="mt-x1 flex items-baseline gap-x1_5">
        <span className="t5-bold tabular-nums text-fg-neutral">{p.score}점</span>
        <span className="t3-regular tabular-nums text-fg-neutral-subtle">
          {p.correctWords}/{p.totalWords}개 정답
        </span>
      </p>
    </div>
  );
}
