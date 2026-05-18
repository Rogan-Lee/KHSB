"use client";

import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";
import { cn } from "@/lib/utils";

function round2(n: number | null | undefined): number | null {
  if (n == null) return null;
  return Math.round(n * 100) / 100;
}

// ExamType — Prisma enum과 동일 (직렬화된 문자열만 받음)
type ExamType = "OFFICIAL_MOCK" | "PRIVATE_MOCK" | "SCHOOL_EXAM";

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

// 과목별 색상 — 단일 시험 종류 내 과목 추세용 (기존 동작 유지)
const SUBJECT_COLORS: Record<string, string> = {
  국어: "#E9541C",
  수학: "#2E9D6B",
  영어: "#C28327",
  한국사: "#6E5BD0",
  탐구: "#3D6FD8",
  사회: "#3D6FD8",
  과학: "#D14343",
};

// 시험 종류 트랙 색상 (3-track) + 한국어 라벨
const EXAM_TYPE_META: Record<ExamType, { label: string; color: string }> = {
  OFFICIAL_MOCK: { label: "공식 모의", color: "#3D6FD8" },
  PRIVATE_MOCK: { label: "사설 모의", color: "#C28327" },
  SCHOOL_EXAM: { label: "내신", color: "#2E9D6B" },
};

const EXAM_TYPE_ORDER: ExamType[] = ["OFFICIAL_MOCK", "PRIVATE_MOCK", "SCHOOL_EXAM"];

type ViewMode = "byType" | "bySubject";

export function MonthlyExamTrendChart({ scores }: Props) {
  const [metric, setMetric] = useState<"grade" | "percentile">("grade");
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
          examNames: { OFFICIAL_MOCK: [], PRIVATE_MOCK: [], SCHOOL_EXAM: [] },
          sums: {
            OFFICIAL_MOCK: { sum: 0, count: 0 },
            PRIVATE_MOCK: { sum: 0, count: 0 },
            SCHOOL_EXAM: { sum: 0, count: 0 },
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

  if (normalizedScores.length === 0 || (view === "byType" ? examTypeSeries.length === 0 : subjectSeries.length === 0)) {
    return <p className="text-sm text-muted-foreground text-center py-8">모의고사 성적이 없습니다</p>;
  }

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

  return (
    <div className="space-y-4">
      {/* 뷰 토글 + 지표 토글 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="inline-flex gap-[2px] bg-panel p-[3px] border border-line rounded-[9px] shadow-[var(--shadow-xs)]">
          <button
            onClick={() => setView("byType")}
            className={cn(
              "h-[22px] px-2.5 text-[11px] rounded-[6px] transition-colors",
              view === "byType" ? "bg-ink text-white" : "text-ink-3 hover:text-ink-2"
            )}
          >
            시험 종류별
          </button>
          <button
            onClick={() => setView("bySubject")}
            className={cn(
              "h-[22px] px-2.5 text-[11px] rounded-[6px] transition-colors",
              view === "bySubject" ? "bg-ink text-white" : "text-ink-3 hover:text-ink-2"
            )}
          >
            과목별
          </button>
        </div>
        <div className="inline-flex gap-[2px] bg-panel p-[3px] border border-line rounded-[9px] shadow-[var(--shadow-xs)]">
          <button
            onClick={() => setMetric("grade")}
            className={cn(
              "h-[22px] px-2.5 text-[11px] rounded-[6px] transition-colors",
              metric === "grade" ? "bg-ink text-white" : "text-ink-3 hover:text-ink-2"
            )}
          >
            등급
          </button>
          <button
            onClick={() => setMetric("percentile")}
            className={cn(
              "h-[22px] px-2.5 text-[11px] rounded-[6px] transition-colors",
              metric === "percentile" ? "bg-ink text-white" : "text-ink-3 hover:text-ink-2"
            )}
          >
            백분위
          </button>
        </div>
      </div>

      {/* 과목별 뷰: 과목 필터 */}
      {view === "bySubject" && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-ink-4 mr-0.5">과목</span>
          <button
            onClick={resetSubjects}
            className={cn(
              "h-[26px] px-2.5 text-[11px] font-medium rounded-[7px] border transition-colors",
              selectedSubjects === null
                ? "bg-ink text-white border-ink"
                : "bg-panel text-ink-3 border-line hover:border-line-strong hover:text-ink-2"
            )}
          >
            전체
          </button>
          {subjects.map((subject) => {
            const active = selectedSubjects ? selectedSubjects.has(subject) : false;
            const color = SUBJECT_COLORS[subject] ?? "#5B5D64";
            return (
              <button
                key={subject}
                onClick={() => toggleSubject(subject)}
                className={cn(
                  "inline-flex items-center gap-1.5 h-[26px] px-2.5 text-[11px] font-medium rounded-[7px] border transition-colors",
                  active
                    ? "text-white border-transparent"
                    : "bg-panel text-ink-2 border-line hover:border-line-strong"
                )}
                style={active ? { background: color } : undefined}
              >
                <span className="h-[6px] w-[6px] rounded-full" style={{ background: active ? "rgba(255,255,255,0.9)" : color }} />
                {subject}
              </button>
            );
          })}
        </div>
      )}

      {/* 최신 성적 요약 — 뷰에 따라 다름 */}
      {view === "byType" ? (
        <div className="grid grid-cols-3 gap-2">
          {presentExamTypes.map((t) => {
            const s = latestByType[t];
            const meta = EXAM_TYPE_META[t];
            if (s.value == null) return null;
            const diff = s.prevValue != null ? s.value - s.prevValue : null;
            const isImprovement = diff == null
              ? false
              : metric === "grade"
              ? diff < 0
              : diff > 0;
            const diffRounded = diff != null ? round2(Math.abs(diff)) : null;
            return (
              <div key={t} className="rounded-[10px] border border-line bg-panel px-3 py-2 shadow-[var(--shadow-xs)]">
                <div className="flex items-center gap-1.5">
                  <span className="h-[6px] w-[6px] rounded-full" style={{ background: meta.color }} />
                  <span className="text-[11px] text-ink-4 font-medium">{meta.label}</span>
                </div>
                <div className="flex items-baseline gap-1.5 mt-1 font-mono tabular-nums">
                  <span className="text-[18px] font-[650] tracking-[-0.03em]" style={{ color: meta.color }}>
                    {metric === "grade" ? `${s.value}등급` : s.value}
                  </span>
                  {diffRounded != null && diffRounded !== 0 && (
                    <span className={cn("text-[10px] font-semibold", isImprovement ? "text-ok" : "text-bad")}>
                      {isImprovement ? "▲" : "▼"} {diffRounded}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {visibleSubjects.map((subject) => {
            const s = latestBySubject[subject];
            const color = SUBJECT_COLORS[subject] ?? "#5B5D64";
            if (s.value == null) return null;
            const diff = s.prevValue != null ? s.value - s.prevValue : null;
            const isImprovement = diff == null
              ? false
              : metric === "grade"
              ? diff < 0
              : diff > 0;
            const diffRounded = diff != null ? round2(Math.abs(diff)) : null;
            return (
              <div key={subject} className="rounded-[10px] border border-line bg-panel px-3 py-2 shadow-[var(--shadow-xs)]">
                <div className="flex items-center gap-1.5">
                  <span className="h-[6px] w-[6px] rounded-full" style={{ background: color }} />
                  <span className="text-[11px] text-ink-4 font-medium">{subject}</span>
                </div>
                <div className="flex items-baseline gap-1.5 mt-1 font-mono tabular-nums">
                  <span className="text-[18px] font-[650] tracking-[-0.03em]" style={{ color }}>
                    {metric === "grade" ? `${s.value}등급` : s.value}
                  </span>
                  {diffRounded != null && diffRounded !== 0 && (
                    <span className={cn("text-[10px] font-semibold", isImprovement ? "text-ok" : "text-bad")}>
                      {isImprovement ? "▲" : "▼"} {diffRounded}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 차트 */}
      <div className="h-72 rounded-[12px] border border-line bg-panel shadow-[var(--shadow-xs)] p-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={view === "byType" ? examTypeSeries : subjectSeries}
            margin={{ top: 10, right: 15, bottom: 5, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEC" vertical={false} />
            <XAxis
              dataKey="date"
              fontSize={11}
              tick={{ fill: "#8A8D94" }}
              tickLine={false}
              axisLine={{ stroke: "#DADAD6" }}
            />
            <YAxis
              fontSize={11}
              tick={{ fill: "#8A8D94" }}
              reversed={metric === "grade"}
              domain={metric === "grade" ? [1, 9] : [0, 100]}
              ticks={metric === "grade" ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [0, 25, 50, 75, 100]}
              tickLine={false}
              axisLine={false}
            />
            {metric === "grade" && (
              <ReferenceLine y={3} stroke="#B9BBC0" strokeDasharray="4 4" label={{ value: "3등급", fontSize: 10, fill: "#8A8D94", position: "right" }} />
            )}
            <Tooltip
              formatter={(v, name) => [metric === "grade" ? `${v}등급` : `${v}`, name]}
              labelFormatter={(label, payload) => {
                const entry = payload?.[0]?.payload as { label?: string; date?: string } | undefined;
                if (!entry) return label;
                return entry.label ? `${entry.label} (${entry.date ?? label})` : (entry.date ?? label);
              }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 10,
                border: "1px solid #E8E8E5",
                boxShadow: "0 10px 28px -12px rgba(20,20,25,0.18)",
              }}
            />
            {view === "byType" ? (
              <>
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11, paddingBottom: 4 }}
                />
                {presentExamTypes.map((t) => {
                  const meta = EXAM_TYPE_META[t];
                  return (
                    <Line
                      key={t}
                      type="monotone"
                      dataKey={t}
                      name={meta.label}
                      stroke={meta.color}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: meta.color, strokeWidth: 2, stroke: "white" }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                  );
                })}
              </>
            ) : (
              visibleSubjects.map((subject) => {
                const color = SUBJECT_COLORS[subject] ?? "#6b7280";
                const isSingleSelected = selectedSubjects?.size === 1;
                return (
                  <Line
                    key={subject}
                    type="monotone"
                    dataKey={subject}
                    stroke={color}
                    strokeWidth={isSingleSelected ? 3 : 2}
                    dot={{ r: isSingleSelected ? 5 : 3, fill: color, strokeWidth: 2, stroke: "white" }}
                    activeDot={{ r: 6 }}
                    connectNulls
                    name={subject}
                  />
                );
              })
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] text-ink-4 text-center">
        {view === "byType"
          ? "시험 종류별 평균 추이입니다. 과목별 상세는 '과목별' 토글로 전환하세요."
          : "과목을 클릭하면 해당 과목의 추세만 확인할 수 있습니다"}
      </p>
    </div>
  );
}
