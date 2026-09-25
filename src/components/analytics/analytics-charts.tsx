"use client";

import type { ReactNode } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ScatterChart, Scatter, ResponsiveContainer, Cell, ReferenceLine,
  LineChart, Line,
} from "recharts";
import { BarChart3 } from "lucide-react";
import type { OverallAnalytics, StudentAnalytics } from "@/actions/analytics";
import type { DailyStayAvg, WeekdayStayAvg } from "@/lib/attendance-stats";
import { EmptyState, StatusBadge } from "@/components/backoffice/ui";

// ─── 색·축 — SEED 토큰 (SVG 속성에 CSS 변수로) ─────────────────────────
const seed = (token: string) => `var(--seed-color-${token})`;

const C = {
  /** 단일 계열 강조색 — 차트당 하나 */
  accent: seed("bg-brand-solid"),
  /** 부호가 의미 있는 값(등급 상승/하락) */
  positive: seed("bg-positive-solid"),
  negative: seed("bg-critical-solid"),
  zero: seed("palette-gray-500"),
  trend: seed("palette-gray-800"),
  grid: seed("stroke-neutral-muted"),
  axis: seed("stroke-neutral-weak"),
  reference: seed("stroke-neutral-weak"),
  tick: seed("fg-neutral-subtle"),
  surface: seed("bg-layer-default"),
  cursor: seed("bg-transparent-pressed"),
};

const TICK = { fontSize: 12, fill: C.tick };
const AXIS_PROPS = { tick: TICK, tickLine: false, axisLine: { stroke: C.axis } } as const;
const Y_AXIS_PROPS = { tick: TICK, tickLine: false, axisLine: false } as const;

// 과목 고유색 — 학부모 리포트 성적 추이(monthly-exam-trend-chart)와 같은 매핑.
// 필터·순서와 무관하게 과목이 같으면 색도 같다(dataviz 팔레트 검증 통과 조합).
const SUBJECT_COLORS: Record<string, string> = {
  국어: seed("palette-carrot-700"),
  수학: seed("palette-blue-700"),
  영어: seed("palette-green-700"),
  한국사: seed("palette-yellow-500"),
};
const EXTRA_SUBJECT_COLORS = [seed("palette-purple-900"), seed("palette-blue-500"), seed("palette-red-900")];
const FALLBACK_COLOR = seed("palette-gray-700");

function subjectColorMap(subjects: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  let extra = 0;
  for (const s of subjects) map[s] = SUBJECT_COLORS[s] ?? EXTRA_SUBJECT_COLORS[extra++] ?? FALLBACK_COLOR;
  return map;
}

// ─── 공통 조각 ────────────────────────────────────────────────────────

/** 차트 툴팁 카드 — SEED floating 표면 */
function TooltipCard({
  title,
  rows,
}: {
  title: ReactNode;
  rows: { label: ReactNode; value: ReactNode; color?: string }[];
}) {
  return (
    <div className="min-w-32 rounded-r3 bg-bg-layer-floating px-x3 py-x2_5 shadow-s2">
      <p className="t3-bold text-fg-neutral">{title}</p>
      <div className="mt-x1 flex flex-col gap-x0_5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-x2 t3-regular">
            {r.color && <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />}
            <span className="flex-1 text-fg-neutral-subtle">{r.label}</span>
            <span className="t3-bold tabular-nums text-fg-neutral">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartEmpty({ text, height = 260 }: { text: string; height?: number }) {
  return (
    <div className="flex items-center justify-center" style={{ height }}>
      <EmptyState compact icon={BarChart3} title={text} />
    </div>
  );
}

function signed(v: number) {
  return `${v > 0 ? "+" : ""}${v}`;
}

// ─── 전체 성적 상승 바 차트 ──────────────────────────────
export function ImprovementBarChart({ students }: { students: StudentAnalytics[] }) {
  const data = students
    .filter((s) => s.avgImprovement !== null)
    .sort((a, b) => (b.avgImprovement ?? 0) - (a.avgImprovement ?? 0))
    .slice(0, 15)
    .map((s) => ({ name: s.studentName, value: s.avgImprovement ?? 0 }));

  if (data.length === 0) return <ChartEmpty text="성적 데이터가 없어요" />;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 40 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="name" {...AXIS_PROPS} angle={-35} textAnchor="end" interval={0} />
        <YAxis {...Y_AXIS_PROPS} width={40} />
        <Tooltip
          cursor={{ fill: C.cursor }}
          content={({ active, payload }) => {
            const d = payload?.[0]?.payload as { name: string; value: number } | undefined;
            if (!active || !d) return null;
            return <TooltipCard title={d.name} rows={[{ label: "평균 등급 상승", value: `${signed(d.value)} 등급` }]} />;
          }}
        />
        <ReferenceLine y={0} stroke={C.reference} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.value > 0 ? C.positive : entry.value < 0 ? C.negative : C.zero} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── 멘토링 횟수 vs 성적 상관관계 산점도 ───────────────────
// 데이터분석 관점 개선:
//  · X/Y 축을 type="number"로 → 카테고리 정렬이 아닌 실제 수치 위치에 플롯
//    (직전 버전은 type 미지정 → 배열 순서대로 그려져 상관관계가 안 보였음)
//  · 최소제곱 선형 회귀선 + 피어슨 상관계수 r 표시 → 관계 방향·강도 정량화
//  · 표본 크기 N 표시, 정수 눈금, 도메인 [0, max]
export function CorrelationScatter({ data }: { data: OverallAnalytics["correlationPoints"] }) {
  if (data.length === 0) return <ChartEmpty text="데이터가 없어요" />;

  // 회귀선 + 피어슨 r 계산 (소량 데이터에서도 안전한 가드 포함)
  const n = data.length;
  const xs = data.map((p) => p.mentoringCount);
  const ys = data.map((p) => p.avgImprovement);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const sumX = xs.reduce((a, x) => a + x, 0);
  const sumY = ys.reduce((a, y) => a + y, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const sumYY = ys.reduce((a, y) => a + y * y, 0);
  const slopeDenom = n * sumXX - sumX * sumX;
  const slope = slopeDenom !== 0 ? (n * sumXY - sumX * sumY) / slopeDenom : 0;
  const intercept = (sumY - slope * sumX) / n;
  const rDenom = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  const r = rDenom > 0 ? (n * sumXY - sumX * sumY) / rDenom : null;
  const canShowTrend = n >= 2 && xMin !== xMax && slopeDenom !== 0;
  const xDomainMax = Math.max(xMax, 1);

  // r 해석 (Cohen 기준 — |r|≥.5 강 / ≥.3 중 / ≥.1 약 / 그 외 거의 없음)
  const corrLabel =
    r === null ? "상관 산정 불가"
    : Math.abs(r) >= 0.5 ? `강한 ${r > 0 ? "양" : "음"}의 상관 (r = ${r.toFixed(2)})`
    : Math.abs(r) >= 0.3 ? `중간 ${r > 0 ? "양" : "음"}의 상관 (r = ${r.toFixed(2)})`
    : Math.abs(r) >= 0.1 ? `약한 ${r > 0 ? "양" : "음"}의 상관 (r = ${r.toFixed(2)})`
    : `상관 거의 없음 (r = ${r.toFixed(2)})`;

  return (
    <div className="flex flex-col gap-x2">
      <div className="flex flex-wrap items-center justify-between gap-x3 t3-regular text-fg-neutral-subtle">
        <span className="tabular-nums">표본 N = {n}명</span>
        <span className="inline-flex items-center gap-x3">
          {canShowTrend && (
            <span className="inline-flex items-center gap-x1_5">
              <span className="h-0.5 w-x4 rounded-full" style={{ background: C.trend }} aria-hidden />
              추세선
            </span>
          )}
          <span className="t3-medium text-fg-neutral-muted tabular-nums">{corrLabel}</span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 16 }}>
          <CartesianGrid stroke={C.grid} />
          <XAxis
            type="number"
            dataKey="mentoringCount"
            name="멘토링 횟수"
            domain={[0, xDomainMax]}
            allowDecimals={false}
            {...AXIS_PROPS}
            label={{ value: "멘토링 횟수 (회)", position: "insideBottom", offset: -8, fontSize: 12, fill: C.tick }}
          />
          <YAxis
            type="number"
            dataKey="avgImprovement"
            name="등급 상승"
            {...Y_AXIS_PROPS}
            width={48}
            label={{ value: "등급 상승", angle: -90, position: "insideLeft", offset: 16, fontSize: 12, fill: C.tick }}
          />
          {/* y=0 (변화 없음) 기준선 */}
          <ReferenceLine y={0} stroke={C.reference} strokeDasharray="4 4" />
          {/* 최소제곱 회귀선 */}
          {canShowTrend && (
            <ReferenceLine
              segment={[
                { x: 0, y: intercept },
                { x: xDomainMax, y: slope * xDomainMax + intercept },
              ]}
              stroke={C.trend}
              strokeWidth={1.5}
              ifOverflow="hidden"
            />
          )}
          <Tooltip
            cursor={{ stroke: C.axis, strokeDasharray: "4 4" }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as OverallAnalytics["correlationPoints"][number] | undefined;
              if (!active || !d) return null;
              return (
                <TooltipCard
                  title={d.studentName}
                  rows={[
                    { label: "멘토링", value: `${d.mentoringCount}회` },
                    { label: "성적", value: `${signed(d.avgImprovement)} 등급` },
                  ]}
                />
              );
            }}
          />
          <Scatter data={data} fill={C.accent} fillOpacity={0.75} stroke={C.surface} strokeWidth={1.5} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── 재원 시간 바 차트 ──────────────────────────────────
export function StudyHoursChart({ students }: { students: StudentAnalytics[] }) {
  const data = students
    .filter((s) => s.studyHours > 0)
    .sort((a, b) => b.studyHours - a.studyHours)
    .slice(0, 15)
    .map((s) => ({ name: s.studentName, hours: s.studyHours }));

  if (data.length === 0) return <ChartEmpty text="출퇴실 기록이 없어요" />;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 40 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="name" {...AXIS_PROPS} angle={-35} textAnchor="end" interval={0} />
        <YAxis {...Y_AXIS_PROPS} unit="h" width={44} />
        <Tooltip
          cursor={{ fill: C.cursor }}
          content={({ active, payload }) => {
            const d = payload?.[0]?.payload as { name: string; hours: number } | undefined;
            if (!active || !d) return null;
            return <TooltipCard title={d.name} rows={[{ label: "총 재원 시간", value: `${d.hours}시간` }]} />;
          }}
        />
        <Bar dataKey="hours" fill={C.accent} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── 일별 평균 재원시간 라인 차트 ──────────────────────
export function DailyStayLineChart({ data }: { data: DailyStayAvg[] }) {
  if (data.length === 0) return <ChartEmpty text="출퇴실 기록이 없어요" />;

  const chartData = data.map((d) => ({ ...d, label: d.date.slice(5).replace("-", "/") }));
  // 점이 많으면(30일) 표식은 호버 때만 — 선이 먼저 읽히게
  const showDots = chartData.length <= 14;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...AXIS_PROPS} tickMargin={8} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...Y_AXIS_PROPS} unit="h" width={44} />
        <Tooltip
          cursor={{ stroke: C.axis, strokeWidth: 1 }}
          content={({ active, payload }) => {
            const d = payload?.[0]?.payload as (DailyStayAvg & { label: string }) | undefined;
            if (!active || !d) return null;
            return (
              <TooltipCard
                title={d.date}
                rows={[
                  { label: "평균 재원", value: `${d.avgHours}시간` },
                  { label: "기록", value: `${d.count}명` },
                ]}
              />
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="avgHours"
          stroke={C.accent}
          strokeWidth={2}
          dot={showDots ? { r: 4, fill: C.accent, stroke: C.surface, strokeWidth: 2 } : false}
          activeDot={{ r: 5, fill: C.accent, stroke: C.surface, strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── 요일별 평균 재원시간 바 차트 ──────────────────────
export function WeekdayStayBarChart({ data }: { data: WeekdayStayAvg[] }) {
  if (data.every((d) => d.avgHours === null)) return <ChartEmpty text="출퇴실 기록이 없어요" />;

  const chartData = data.map((d) => ({ ...d, hours: d.avgHours ?? 0 }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 8, right: 4, left: -16, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...AXIS_PROPS} tickMargin={8} />
        <YAxis {...Y_AXIS_PROPS} unit="h" width={44} />
        <Tooltip
          cursor={{ fill: C.cursor }}
          content={({ active, payload }) => {
            const d = payload?.[0]?.payload as WeekdayStayAvg | undefined;
            if (!active || !d) return null;
            return (
              <TooltipCard
                title={`${d.label}요일`}
                rows={[
                  { label: "평균 재원", value: d.avgHours !== null ? `${d.avgHours}시간` : "-" },
                  { label: "평균 입실", value: d.avgCheckIn ?? "-" },
                  { label: "기록", value: `${d.count}건` },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="hours" fill={C.accent} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── 개인 과목별 성적 추이 라인 차트 ────────────────────
export function SubjectTrendChart({ student }: { student: StudentAnalytics }) {
  const subjects = student.subjects.filter(
    (s) => s.firstGrade !== null && s.latestGrade !== null && s.firstDate !== s.latestDate
  );

  if (subjects.length === 0) return <ChartEmpty text="성적 추이 데이터가 없어요" height={200} />;

  const data = [
    { label: "처음", ...Object.fromEntries(subjects.map((s) => [s.subject, s.firstGrade])) },
    { label: "최근", ...Object.fromEntries(subjects.map((s) => [s.subject, s.latestGrade])) },
  ];

  // 과목 색은 학생의 전체 과목 기준으로 고정 배정
  const colors = subjectColorMap(student.subjects.map((s) => s.subject));

  return (
    <div className="flex flex-col gap-x2">
      {/* 범례 — 계열 2개 이상일 때 */}
      {subjects.length > 1 && (
        <ul className="flex flex-wrap gap-x3 t3-regular text-fg-neutral-muted" aria-label="과목 범례">
          {subjects.map((s) => (
            <li key={s.subject} className="inline-flex items-center gap-x1_5">
              <span className="h-0.5 w-x3 rounded-full" style={{ background: colors[s.subject] }} aria-hidden />
              {s.subject}
            </li>
          ))}
        </ul>
      )}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -4, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" {...AXIS_PROPS} tickMargin={8} padding={{ left: 24, right: 24 }} />
          <YAxis
            reversed
            {...Y_AXIS_PROPS}
            width={48}
            domain={[1, 9]}
            ticks={[1, 3, 5, 7, 9]}
            tickFormatter={(v) => `${v}등급`}
          />
          <Tooltip
            cursor={{ stroke: C.axis, strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <TooltipCard
                  title={label}
                  rows={payload.map((p) => ({
                    label: String(p.dataKey),
                    value: `${p.value}등급`,
                    color: colors[String(p.dataKey)],
                  }))}
                />
              );
            }}
          />
          {subjects.map((s) => (
            <Line
              key={s.subject}
              type="monotone"
              dataKey={s.subject}
              stroke={colors[s.subject]}
              strokeWidth={2}
              dot={{ r: 4, fill: colors[s.subject], stroke: C.surface, strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: C.surface, strokeWidth: 2 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── 개인 성적 테이블 ───────────────────────────────────
export function SubjectTable({ student }: { student: StudentAnalytics }) {
  if (student.subjects.length === 0) return <ChartEmpty text="성적 데이터가 없어요" height={160} />;

  return (
    <div className="overflow-x-auto rounded-r3 border border-stroke-neutral-muted">
      <table className="w-full t4-regular tabular-nums">
        <thead className="bg-bg-layer-fill">
          <tr className="border-b border-stroke-neutral-muted">
            <th className="px-x4 py-x2 text-left t3-medium text-fg-neutral-subtle">과목</th>
            <th className="px-x4 py-x2 text-right t3-medium text-fg-neutral-subtle">처음</th>
            <th className="px-x4 py-x2 text-right t3-medium text-fg-neutral-subtle">최근</th>
            <th className="px-x4 py-x2 text-right t3-medium text-fg-neutral-subtle">변화</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stroke-neutral-muted">
          {student.subjects.map((s) => (
            <tr key={s.subject}>
              <td className="px-x4 py-x2_5 t4-medium text-fg-neutral">{s.subject}</td>
              <td className="px-x4 py-x2_5 text-right text-fg-neutral-muted">
                {s.firstGrade ? `${s.firstGrade}등급` : "-"}
              </td>
              <td className="px-x4 py-x2_5 text-right text-fg-neutral-muted">
                {s.latestGrade ? `${s.latestGrade}등급` : "-"}
              </td>
              <td className="px-x4 py-x2_5 text-right">
                {s.improvement !== null ? (
                  <StatusBadge tone={s.improvement > 0 ? "ok" : s.improvement < 0 ? "bad" : "gray"}>
                    {s.improvement > 0
                      ? `▲ ${s.improvement}등급`
                      : s.improvement < 0
                      ? `▼ ${Math.abs(s.improvement)}등급`
                      : "변동 없음"}
                  </StatusBadge>
                ) : (
                  <span className="text-fg-placeholder">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
