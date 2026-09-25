"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  type TooltipPayloadEntry,
} from "recharts";
import { Chip } from "seed-design/ui/chip";
import { Segmented } from "@/components/portal/ui";
import { cn } from "@/lib/utils";

function round2(n: number | null | undefined): number | null {
  if (n == null) return null;
  return Math.round(n * 100) / 100;
}

// ExamType — Prisma enum과 동일 (직렬화된 문자열만 받음)
type ExamType = "OFFICIAL_MOCK" | "PRIVATE_MOCK" | "SCHOOL_EXAM" | "DUFF";

interface Score {
  examDate: string;
  examName: string;
  subject: string;
  grade: number | null;
  percentile: number | null;
  examType?: ExamType; // 신규 — 미지정 시 OFFICIAL_MOCK로 fallback (기존 호출부 호환)
}

interface Props {
  scores: Score[];
}

// ─── 색 — SEED 팔레트 ────────────────────────────────────────────────
// 학부모 리포트(ReportShell, light-only) 안에서만 쓰이므로 SEED CSS 변수를 SVG 속성에 그대로 넣는다.
// 순서·단계는 dataviz 팔레트 검증(색각이상 구분 ΔE, 정상 시각 ΔE ≥ 15)을 통과한 조합.
const seed = (token: string) => `var(--seed-color-${token})`;

// 과목 고유색 — 주요 과목은 고정, 그 외(탐구 세부 과목 등)는 등장 순서대로 보조색 배정.
// 필터로 일부 과목을 숨겨도 남은 과목의 색은 바뀌지 않는다(전체 과목 기준으로 배정).
const SUBJECT_COLORS: Record<string, string> = {
  국어: seed("palette-carrot-700"),
  수학: seed("palette-blue-700"),
  영어: seed("palette-green-700"),
  한국사: seed("palette-yellow-500"),
};
const EXTRA_SUBJECT_COLORS = [
  seed("palette-purple-900"),
  seed("palette-blue-500"),
  seed("palette-red-900"),
];
const FALLBACK_COLOR = seed("palette-gray-700");

// 시험 종류 트랙 색상 + 한국어 라벨
const EXAM_TYPE_META: Record<ExamType, { label: string; color: string }> = {
  OFFICIAL_MOCK: { label: "공식 모의", color: seed("palette-carrot-700") },
  PRIVATE_MOCK: { label: "사설 모의", color: seed("palette-blue-700") },
  SCHOOL_EXAM: { label: "내신", color: seed("palette-green-700") },
  DUFF: { label: "더프", color: seed("palette-purple-900") },
};

const EXAM_TYPE_ORDER: ExamType[] = ["OFFICIAL_MOCK", "PRIVATE_MOCK", "SCHOOL_EXAM", "DUFF"];

// 축·격자 — 데이터보다 한 단계 뒤로 물러나게
const AXIS = {
  grid: seed("stroke-neutral-subtle"),
  axisLine: seed("stroke-neutral-weak"),
  tick: seed("fg-neutral-subtle"),
  reference: seed("palette-gray-500"),
  surface: seed("bg-layer-default"),
};

type ViewMode = "byType" | "bySubject";
type Metric = "grade" | "percentile";

/** "9. 3." (ko-KR 월/일) → "9/3" */
function shortDate(v: unknown): string {
  const parts = String(v ?? "")
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : String(v ?? "");
}

function formatValue(v: number, metric: Metric): string {
  return metric === "grade" ? `${v}등급` : `${v}`;
}

export function MonthlyExamTrendChart({ scores }: Props) {
  const [metric, setMetric] = useState<Metric>("grade");
  const [view, setView] = useState<ViewMode>("byType");
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string> | null>(null);

  // 데이터 정규화 — examType이 없으면 OFFICIAL_MOCK으로 fallback
  const normalizedScores = useMemo(
    () =>
      scores.map((s) => ({
        ...s,
        examType: (s.examType ?? "OFFICIAL_MOCK") as ExamType,
      })),
    [scores]
  );

  // 과목 + 데이터에 존재하는 examType 수집
  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const s of normalizedScores) set.add(s.subject);
    return Array.from(set);
  }, [normalizedScores]);

  const presentExamTypes = useMemo(() => {
    const set = new Set<ExamType>();
    for (const s of normalizedScores) set.add(s.examType);
    return EXAM_TYPE_ORDER.filter((t) => set.has(t));
  }, [normalizedScores]);

  // 과목 → 색 (전체 과목 기준, 필터와 무관하게 고정)
  const subjectColors = useMemo(() => {
    const map: Record<string, string> = {};
    let extra = 0;
    for (const subject of subjects) {
      map[subject] = SUBJECT_COLORS[subject] ?? EXTRA_SUBJECT_COLORS[extra++] ?? FALLBACK_COLOR;
    }
    return map;
  }, [subjects]);

  // 과목별 시리즈 (기존 동작) — examName+examDate 그룹화, 과목 컬럼
  const subjectSeries = useMemo(() => {
    const byExam = new Map<string, { label: string; date: string; sortKey: string; [key: string]: string | number | null }>();
    for (const s of normalizedScores) {
      const key = `${s.examDate}-${s.examName}`;
      if (!byExam.has(key)) {
        byExam.set(key, {
          label: s.examName,
          date: new Date(s.examDate).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
          sortKey: s.examDate,
        });
      }
      const entry = byExam.get(key)!;
      entry[s.subject] = round2(metric === "grade" ? s.grade : s.percentile);
    }
    return Array.from(byExam.values()).sort((a, b) =>
      (a.sortKey as string).localeCompare(b.sortKey as string)
    );
  }, [normalizedScores, metric]);

  // 시험 종류 시리즈 (신규 3-track) — examDate 그룹화, 종류별 평균 (과목 전체 평균)
  const examTypeSeries = useMemo(() => {
    const byDate = new Map<
      string,
      {
        label: string;
        date: string;
        sortKey: string;
        examNames: Record<ExamType, string[]>;
        sums: Record<ExamType, { sum: number; count: number }>;
        [key: string]: unknown;
      }
    >();
    for (const s of normalizedScores) {
      const v = metric === "grade" ? s.grade : s.percentile;
      if (v == null) continue;
      const key = s.examDate;
      if (!byDate.has(key)) {
        byDate.set(key, {
          label: "",
          date: new Date(s.examDate).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
          sortKey: s.examDate,
          examNames: { OFFICIAL_MOCK: [], PRIVATE_MOCK: [], SCHOOL_EXAM: [], DUFF: [] },
          sums: {
            OFFICIAL_MOCK: { sum: 0, count: 0 },
            PRIVATE_MOCK: { sum: 0, count: 0 },
            SCHOOL_EXAM: { sum: 0, count: 0 },
            DUFF: { sum: 0, count: 0 },
          },
        });
      }
      const entry = byDate.get(key)!;
      entry.sums[s.examType].sum += v;
      entry.sums[s.examType].count += 1;
      if (!entry.examNames[s.examType].includes(s.examName)) {
        entry.examNames[s.examType].push(s.examName);
      }
    }
    const sorted = Array.from(byDate.values()).sort((a, b) =>
      (a.sortKey as string).localeCompare(b.sortKey as string)
    );
    // 각 종류 평균값을 row에 분리 컬럼으로 추가
    return sorted.map((row) => {
      const out: { label: string; date: string; sortKey: string; [k: string]: unknown } = {
        label: EXAM_TYPE_ORDER.flatMap((t) => row.examNames[t]).join(" · "),
        date: row.date,
        sortKey: row.sortKey,
      };
      for (const t of EXAM_TYPE_ORDER) {
        const { sum, count } = row.sums[t];
        out[t] = count > 0 ? round2(sum / count) : null;
      }
      return out;
    });
  }, [normalizedScores, metric]);

  if (normalizedScores.length === 0) {
    return <p className="py-x8 text-center t4-regular text-fg-neutral-subtle">모의고사 성적이 아직 없어요</p>;
  }

  // 지표(등급/백분위)에 값이 하나도 없으면 차트 대신 안내 — 지표 전환은 계속 가능해야 한다
  const hasData = view === "byType" ? examTypeSeries.length > 0 : subjectSeries.length > 0;

  const visibleSubjects = selectedSubjects
    ? subjects.filter((s) => selectedSubjects.has(s))
    : subjects;

  function toggleSubject(subject: string) {
    setSelectedSubjects((prev) => {
      if (prev === null) return new Set([subject]);
      const next = new Set(prev);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next.size === 0 ? null : next;
    });
  }

  function resetSubjects() {
    setSelectedSubjects(null);
  }

  // 최신 성적 요약 (과목별, byType 뷰에선 종류별로 대체)
  const latestBySubject: Record<string, { value: number | null; prevValue: number | null }> = {};
  for (const subject of subjects) {
    let latest: number | null = null;
    let prev: number | null = null;
    for (const row of subjectSeries) {
      const v = row[subject] as number | null | undefined;
      if (typeof v === "number") {
        prev = latest;
        latest = v;
      }
    }
    latestBySubject[subject] = { value: latest, prevValue: prev };
  }

  const latestByType: Record<ExamType, { value: number | null; prevValue: number | null }> = {
    OFFICIAL_MOCK: { value: null, prevValue: null },
    PRIVATE_MOCK: { value: null, prevValue: null },
    SCHOOL_EXAM: { value: null, prevValue: null },
    DUFF: { value: null, prevValue: null },
  };
  for (const t of EXAM_TYPE_ORDER) {
    let latest: number | null = null;
    let prev: number | null = null;
    for (const row of examTypeSeries) {
      const v = row[t] as number | null | undefined;
      if (typeof v === "number") {
        prev = latest;
        latest = v;
      }
    }
    latestByType[t] = { value: latest, prevValue: prev };
  }

  // 요약 칸 — 값이 있는 시리즈만
  const summaryCells =
    view === "byType"
      ? presentExamTypes
          .filter((t) => latestByType[t].value != null)
          .map((t) => ({
            key: t,
            label: EXAM_TYPE_META[t].label,
            color: EXAM_TYPE_META[t].color,
            ...latestByType[t],
          }))
      : visibleSubjects
          .filter((subject) => latestBySubject[subject]?.value != null)
          .map((subject) => ({
            key: subject,
            label: subject,
            color: subjectColors[subject],
            ...latestBySubject[subject],
          }));
  const summaryCols =
    summaryCells.length === 1
      ? "grid-cols-1"
      : summaryCells.length === 2 || summaryCells.length === 4
        ? "grid-cols-2"
        : "grid-cols-3";

  const isSingleSelected = selectedSubjects?.size === 1;

  return (
    <div className="flex flex-col gap-x4">
      {/* 보기 전환 */}
      <Segmented<ViewMode>
        aria-label="성적 보기 방식"
        value={view}
        onChange={setView}
        options={[
          { value: "byType", label: "시험 종류별" },
          { value: "bySubject", label: "과목별" },
        ]}
      />

      {/* 과목별 뷰: 과목 필터 (색 점 = 범례) */}
      {view === "bySubject" && subjects.length > 0 && (
        <div className="flex flex-wrap gap-x1_5" role="group" aria-label="과목 선택">
          <Chip.Toggle size="small" checked={selectedSubjects === null} onCheckedChange={resetSubjects}>
            <Chip.Label>전체</Chip.Label>
          </Chip.Toggle>
          {subjects.map((subject) => (
            <Chip.Toggle
              key={subject}
              size="small"
              checked={selectedSubjects ? selectedSubjects.has(subject) : false}
              onCheckedChange={() => toggleSubject(subject)}
            >
              <Chip.Label>
                <span
                  aria-hidden
                  className="mr-x1_5 size-x2 shrink-0 rounded-full"
                  style={{ background: subjectColors[subject] }}
                />
                {subject}
              </Chip.Label>
            </Chip.Toggle>
          ))}
        </div>
      )}

      {/* 최근 결과 + 지표 전환 */}
      <div className="flex flex-col gap-x2_5">
        <div className="flex items-center justify-between gap-x2">
          <p className="t4-bold text-fg-neutral-muted">
            {view === "byType" ? "가장 최근 평균" : "과목별 최근 성적"}
          </p>
          <Chip.RadioRoot
            value={metric}
            onValueChange={(v) => setMetric(v as Metric)}
            aria-label="성적 기준"
            className="flex shrink-0 gap-x1"
          >
            <Chip.RadioItem value="grade" size="small">
              <Chip.Label>등급</Chip.Label>
            </Chip.RadioItem>
            <Chip.RadioItem value="percentile" size="small">
              <Chip.Label>백분위</Chip.Label>
            </Chip.RadioItem>
          </Chip.RadioRoot>
        </div>

        {hasData && summaryCells.length > 0 && (
          <div className={cn("grid gap-x2", summaryCols)}>
            {summaryCells.map((c) => (
              <LatestCell
                key={c.key}
                label={c.label}
                color={c.color}
                value={c.value!}
                prevValue={c.prevValue}
                metric={metric}
              />
            ))}
          </div>
        )}
      </div>

      {!hasData ? (
        <p className="rounded-r3 bg-bg-layer-fill py-x8 text-center t4-regular text-fg-neutral-subtle">
          {metric === "grade" ? "등급이" : "백분위가"} 입력된 시험이 아직 없어요
        </p>
      ) : (
        <>
          {/* 차트 */}
          <div className="flex flex-col gap-x2">
            {view === "byType" && presentExamTypes.length > 0 && (
              <ul className="flex flex-wrap gap-x-x3 gap-y-x1" aria-label="범례">
                {presentExamTypes.map((t) => (
                  <li key={t} className="flex items-center gap-x1_5 t3-medium text-fg-neutral-muted">
                    <span
                      aria-hidden
                      className="size-x2 shrink-0 rounded-full"
                      style={{ background: EXAM_TYPE_META[t].color }}
                    />
                    {EXAM_TYPE_META[t].label}
                  </li>
                ))}
              </ul>
            )}
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={view === "byType" ? examTypeSeries : subjectSeries}
                  margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid stroke={AXIS.grid} vertical={false} />
                  <XAxis
                    dataKey="date"
                    fontSize={12}
                    tick={{ fill: AXIS.tick }}
                    tickFormatter={shortDate}
                    tickLine={false}
                    axisLine={{ stroke: AXIS.axisLine }}
                    tickMargin={8}
                    interval="preserveStartEnd"
                    minTickGap={12}
                  />
                  <YAxis
                    fontSize={12}
                    tick={{ fill: AXIS.tick }}
                    reversed={metric === "grade"}
                    domain={metric === "grade" ? [1, 9] : [0, 100]}
                    ticks={metric === "grade" ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [0, 25, 50, 75, 100]}
                    tickLine={false}
                    axisLine={false}
                    width={metric === "grade" ? 24 : 32}
                  />
                  {metric === "grade" && (
                    <ReferenceLine
                      y={3}
                      stroke={AXIS.reference}
                      strokeDasharray="4 4"
                      label={{ value: "3등급", fontSize: 11, fill: AXIS.tick, position: "insideBottomRight" }}
                    />
                  )}
                  <Tooltip
                    cursor={{ stroke: AXIS.axisLine, strokeWidth: 1 }}
                    content={({ active, payload, label }) => (
                      <ChartTooltip active={active} payload={payload} label={label} metric={metric} />
                    )}
                  />
                  {view === "byType"
                    ? presentExamTypes.map((t) => {
                        const meta = EXAM_TYPE_META[t];
                        return (
                          <Line
                            key={t}
                            type="monotone"
                            dataKey={t}
                            name={meta.label}
                            stroke={meta.color}
                            strokeWidth={2}
                            dot={{ r: 4, fill: meta.color, strokeWidth: 2, stroke: AXIS.surface }}
                            activeDot={{ r: 6, strokeWidth: 2, stroke: AXIS.surface }}
                            connectNulls
                          />
                        );
                      })
                    : visibleSubjects.map((subject) => {
                        const color = subjectColors[subject];
                        return (
                          <Line
                            key={subject}
                            type="monotone"
                            dataKey={subject}
                            stroke={color}
                            strokeWidth={isSingleSelected ? 3 : 2}
                            dot={{ r: isSingleSelected ? 5 : 4, fill: color, strokeWidth: 2, stroke: AXIS.surface }}
                            activeDot={{ r: 6, strokeWidth: 2, stroke: AXIS.surface }}
                            connectNulls
                            name={subject}
                          />
                        );
                      })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <p className="t3-regular text-fg-neutral-subtle">
            {metric === "grade" ? "등급은 숫자가 작을수록 좋아요. " : "백분위는 숫자가 클수록 좋아요. "}
            {view === "byType"
              ? "시험 종류별 과목 평균이에요. 과목별 흐름은 '과목별'에서 볼 수 있어요."
              : "과목을 누르면 그 과목만 골라 볼 수 있어요."}
          </p>
        </>
      )}
    </div>
  );
}

/** 최근 값 칸 — 색 점으로 시리즈를 표시하고 숫자는 본문색. ▲ = 직전보다 좋아짐 */
function LatestCell({
  label,
  color,
  value,
  prevValue,
  metric,
}: {
  label: string;
  color: string;
  value: number;
  prevValue: number | null;
  metric: Metric;
}) {
  const diff = prevValue != null ? value - prevValue : null;
  const isImprovement = diff == null ? false : metric === "grade" ? diff < 0 : diff > 0;
  const diffRounded = diff != null ? round2(Math.abs(diff)) : null;
  return (
    <div className="flex min-w-0 flex-col gap-x1 rounded-r3 bg-bg-layer-fill px-x3 py-x3">
      <span className="flex min-w-0 items-center gap-x1_5 t3-medium text-fg-neutral-muted">
        <span aria-hidden className="size-x2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate">{label}</span>
      </span>
      <span className="t6-bold tabular-nums text-fg-neutral">
        {value}
        {metric === "grade" && <span className="ml-x0_5 t3-medium text-fg-neutral-muted">등급</span>}
      </span>
      {diffRounded != null && diffRounded !== 0 ? (
        <span
          className={cn("t2-bold tabular-nums", isImprovement ? "text-fg-positive" : "text-fg-critical")}
          aria-label={`직전보다 ${diffRounded} ${isImprovement ? "좋아졌어요" : "내려갔어요"}`}
        >
          {isImprovement ? "▲" : "▼"} {diffRounded}
        </span>
      ) : diffRounded === 0 ? (
        <span className="t2-regular text-fg-neutral-subtle">직전과 같아요</span>
      ) : null}
    </div>
  );
}

/** SEED 떠 있는 레이어 스타일 툴팁 */
function ChartTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipPayloadEntry>;
  label?: string | number;
  metric: Metric;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0]?.payload as { label?: string; date?: string } | undefined;
  const date = shortDate(entry?.date ?? label);
  const rows = payload.filter((p) => typeof p.value === "number");
  if (rows.length === 0) return null;
  return (
    <div className="min-w-[148px] max-w-[240px] rounded-r3 bg-bg-layer-floating px-x3 py-x2_5 shadow-s2">
      <p className="t3-bold text-fg-neutral">{entry?.label ? entry.label : date}</p>
      {entry?.label && <p className="t2-regular tabular-nums text-fg-neutral-subtle">{date}</p>}
      <ul className="mt-x2 flex flex-col gap-x1">
        {rows.map((p) => (
          <li key={String(p.dataKey ?? p.name)} className="flex items-center gap-x2 t3-regular">
            <span aria-hidden className="size-x2 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate text-fg-neutral-muted">{p.name}</span>
            <span className="t3-bold tabular-nums text-fg-neutral">{formatValue(p.value as number, metric)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
