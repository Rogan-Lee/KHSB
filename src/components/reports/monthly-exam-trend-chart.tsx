"use client";

import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { cn } from "@/lib/utils";

function round2(n: number | null | undefined): number | null {
  if (n == null) return null;
  return Math.round(n * 100) / 100;
}

interface Score {
  examDate: string;
  examName: string;
  subject: string;
  grade: number | null;
  percentile: number | null;
}

interface Props {
  scores: Score[];
}

// v4 palette — calmer pastels
const SUBJECT_COLORS: Record<string, string> = {
  국어: "#E9541C",   // brand mandarin
  수학: "#2E9D6B",   // ok
  영어: "#C28327",   // warn
  한국사: "#6E5BD0", // violet
  탐구: "#3D6FD8",   // info
  사회: "#3D6FD8",
  과학: "#D14343",   // bad
};

export function MonthlyExamTrendChart({ scores }: Props) {
  const [metric, setMetric] = useState<"grade" | "percentile">("grade");
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string> | null>(null);

  const { subjects, series } = useMemo(() => {
    // 과목 목록 수집
    const subjectSet = new Set<string>();
    for (const s of scores) subjectSet.add(s.subject);
    const allSubjects = Array.from(subjectSet);

    // 시험별(examName + examDate) 그룹화 → 각 과목의 값 담기
    const byExam = new Map<string, { label: string; date: string; sortKey: string; [key: string]: string | number | null }>();
    for (const s of scores) {
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

    const sorted = Array.from(byExam.values()).sort((a, b) =>
      (a.sortKey as string).localeCompare(b.sortKey as string)
    );

    return { subjects: allSubjects, series: sorted };
  }, [scores, metric]);

  if (series.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">모의고사 성적이 없습니다</p>;
  }

  const visibleSubjects = selectedSubjects
    ? subjects.filter((s) => selectedSubjects.has(s))
    : subjects;

  function toggleSubject(subject: string) {
    setSelectedSubjects((prev) => {
      // null = 전체 표시 상태. 첫 클릭 시 이 과목 하나만 선택
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

  // 최신 성적 (각 과목) — 뱃지용
  const latestScores: Record<string, { value: number | null; prevValue: number | null }> = {};
  for (const subject of subjects) {
    let latest: number | null = null;
    let prev: number | null = null;
    for (const row of series) {
      const v = row[subject] as number | null | undefined;
      if (typeof v === "number") {
        prev = latest;
        latest = v;
      }
    }
    latestScores[subject] = { value: latest, prevValue: prev };
  }

  return (
    <div className="space-y-4">
      {/* 지표 + 과목 필터 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
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

      {/* 최신 성적 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {visibleSubjects.map((subject) => {
          const s = latestScores[subject];
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

      {/* 차트 */}
      <div className="h-72 rounded-[12px] border border-line bg-panel shadow-[var(--shadow-xs)] p-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 10, right: 15, bottom: 5, left: 0 }}>
            <defs>
              {visibleSubjects.map((subject) => {
                const color = SUBJECT_COLORS[subject] ?? "#6b7280";
                return (
                  <linearGradient key={subject} id={`grad-${subject}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                );
              })}
            </defs>
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
                const entry = payload?.[0]?.payload;
                return entry ? `${entry.label} (${entry.date})` : label;
              }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 10,
                border: "1px solid #E8E8E5",
                boxShadow: "0 10px 28px -12px rgba(20,20,25,0.18)",
              }}
            />
            {visibleSubjects.map((subject) => {
              const color = SUBJECT_COLORS[subject] ?? "#6b7280";
              // 단일 선택 시 강조 (선 두께 ↑, 점 강조)
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
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] text-ink-4 text-center">
        과목을 클릭하면 해당 과목의 추세만 확인할 수 있습니다
      </p>
    </div>
  );
}
