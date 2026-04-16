"use client";

import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

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

  const { data, subjects } = useMemo(() => {
    // 시험별(examName + examDate)로 그룹화 → 과목별 점수
    const byExam = new Map<string, { label: string; date: string; [key: string]: string | number | null }>();
    const subjectSet = new Set<string>();

    for (const s of scores) {
      const key = `${s.examDate}-${s.examName}`;
      if (!byExam.has(key)) {
        byExam.set(key, {
          label: s.examName,
          date: new Date(s.examDate).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
        });
      }
      const entry = byExam.get(key)!;
      entry[s.subject] = metric === "grade" ? s.grade : s.percentile;
      subjectSet.add(s.subject);
    }

    return {
      data: Array.from(byExam.values()).sort((a, b) => (a.date as string).localeCompare(b.date as string)),
      subjects: Array.from(subjectSet),
    };
  }, [scores, metric]);

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">모의고사 성적이 없습니다</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={() => setMetric("grade")}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
            metric === "grade" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          등급
        </button>
        <button
          onClick={() => setMetric("percentile")}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
            metric === "percentile" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          백분위
        </button>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="date" fontSize={11} />
            <YAxis
              fontSize={11}
              reversed={metric === "grade"}
              domain={metric === "grade" ? [1, 9] : [0, 100]}
              ticks={metric === "grade" ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : undefined}
            />
            <Tooltip
              formatter={(v) => (metric === "grade" ? `${v}등급` : `${v}`)}
              labelFormatter={(label, payload) => {
                const entry = payload?.[0]?.payload;
                return entry ? `${entry.label} (${entry.date})` : label;
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {subjects.map((subject) => (
              <Line
                key={subject}
                type="monotone"
                dataKey={subject}
                stroke={SUBJECT_COLORS[subject] ?? "#6b7280"}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
