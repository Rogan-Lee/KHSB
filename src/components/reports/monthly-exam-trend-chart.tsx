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

const SUBJECT_COLORS: Record<string, string> = {
  국어: "#3b82f6",
  수학: "#10b981",
  영어: "#f59e0b",
  한국사: "#a855f7",
  탐구: "#ec4899",
  사회: "#ec4899",
  과학: "#ef4444",
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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">과목</span>
          <button
            onClick={resetSubjects}
            className={cn(
              "px-2 py-1 text-xs rounded-md border transition-colors",
              selectedSubjects === null ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground hover:text-foreground"
            )}
          >
            전체
          </button>
          {subjects.map((subject) => {
            const active = selectedSubjects ? selectedSubjects.has(subject) : false;
            const color = SUBJECT_COLORS[subject] ?? "#6b7280";
            return (
              <button
                key={subject}
                onClick={() => toggleSubject(subject)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border transition-colors",
                  active
                    ? "text-white border-transparent"
                    : "bg-background text-muted-foreground hover:text-foreground"
                )}
                style={active ? { background: color } : undefined}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: active ? "white" : color }} />
                {subject}
              </button>
            );
          })}
        </div>
        <div className="inline-flex gap-1 bg-muted/50 rounded-md p-0.5 border">
          <button
            onClick={() => setMetric("grade")}
            className={cn(
              "px-2.5 py-1 text-xs rounded transition-colors",
              metric === "grade" ? "bg-white shadow-sm" : "text-muted-foreground"
            )}
          >
            등급
          </button>
          <button
            onClick={() => setMetric("percentile")}
            className={cn(
              "px-2.5 py-1 text-xs rounded transition-colors",
              metric === "percentile" ? "bg-white shadow-sm" : "text-muted-foreground"
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
          const color = SUBJECT_COLORS[subject] ?? "#6b7280";
          if (s.value == null) return null;
          const diff = s.prevValue != null ? s.value - s.prevValue : null;
          // 등급 기준: 숫자가 내려가면 좋음 (1등급이 최고), 백분위는 올라가면 좋음
          const isImprovement = diff == null
            ? false
            : metric === "grade"
            ? diff < 0
            : diff > 0;
          const diffRounded = diff != null ? round2(Math.abs(diff)) : null;
          return (
            <div key={subject} className="rounded-md border p-2">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                <span className="text-xs text-muted-foreground">{subject}</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-lg font-bold" style={{ color }}>
                  {metric === "grade" ? `${s.value}등급` : s.value}
                </span>
                {diffRounded != null && diffRounded !== 0 && (
                  <span className={cn("text-[10px] font-medium", isImprovement ? "text-emerald-600" : "text-red-500")}>
                    {isImprovement ? "▲" : "▼"} {diffRounded}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 차트 */}
      <div className="h-72 bg-gradient-to-b from-gray-50/50 to-transparent rounded-lg p-2">
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
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="date"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#d1d5db" }}
            />
            <YAxis
              fontSize={11}
              reversed={metric === "grade"}
              domain={metric === "grade" ? [1, 9] : [0, 100]}
              ticks={metric === "grade" ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [0, 25, 50, 75, 100]}
              tickLine={false}
              axisLine={false}
            />
            {/* 등급 차트: 3등급 기준선 (안정 등급) */}
            {metric === "grade" && (
              <ReferenceLine y={3} stroke="#9ca3af" strokeDasharray="4 4" label={{ value: "3등급", fontSize: 10, fill: "#9ca3af", position: "right" }} />
            )}
            <Tooltip
              formatter={(v, name) => [metric === "grade" ? `${v}등급` : `${v}`, name]}
              labelFormatter={(label, payload) => {
                const entry = payload?.[0]?.payload;
                return entry ? `${entry.label} (${entry.date})` : label;
              }}
              contentStyle={{ fontSize: 12, borderRadius: 6 }}
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

      <p className="text-xs text-muted-foreground text-center">
        과목을 클릭하면 해당 과목의 추세만 확인할 수 있습니다
      </p>
    </div>
  );
}
