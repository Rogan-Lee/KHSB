"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ScatterChart, Scatter, ResponsiveContainer, Cell, ReferenceLine,
  LineChart, Line, Legend,
} from "recharts";
import type { OverallAnalytics, StudentAnalytics } from "@/actions/analytics";
import { cn } from "@/lib/utils";

// ─── 전체 성적 상승 바 차트 ──────────────────────────────
export function ImprovementBarChart({ students }: { students: StudentAnalytics[] }) {
  const data = students
    .filter((s) => s.avgImprovement !== null)
    .sort((a, b) => (b.avgImprovement ?? 0) - (a.avgImprovement ?? 0))
    .slice(0, 15)
    .map((s) => ({ name: s.studentName, value: s.avgImprovement ?? 0 }));

  if (data.length === 0) return <EmptyState text="성적 데이터가 없습니다" />;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFEFEC" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v) => [`${Number(v) > 0 ? "+" : ""}${v} 등급`, "평균 등급 상승"]}
          labelStyle={{ fontSize: 12 }}
        />
        <ReferenceLine y={0} stroke="#D8D9DC" />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.value > 0 ? "#2E9D6B" : entry.value < 0 ? "#D14343" : "#8A8D94"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── 멘토링 횟수 vs 성적 상관관계 산점도 ───────────────────
export function CorrelationScatter({ data }: { data: OverallAnalytics["correlationPoints"] }) {
  if (data.length === 0) return <EmptyState text="데이터가 없습니다" />;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ top: 4, right: 12, left: -20, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEC" />
        <XAxis dataKey="mentoringCount" name="멘토링 횟수" tick={{ fontSize: 11 }} label={{ value: "멘토링 횟수", position: "insideBottom", offset: -2, fontSize: 11 }} />
        <YAxis dataKey="avgImprovement" name="등급 상승" tick={{ fontSize: 11 }} />
        <ReferenceLine y={0} stroke="#D8D9DC" />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ payload }) => {
            if (!payload?.length) return null;
            const d = payload[0]?.payload;
            return (
              <div className="bg-white border border-border rounded-lg px-3 py-2 shadow text-xs">
                <p className="font-medium">{d.studentName}</p>
                <p>멘토링 {d.mentoringCount}회</p>
                <p>성적 {d.avgImprovement > 0 ? "+" : ""}{d.avgImprovement} 등급</p>
              </div>
            );
          }}
        />
        <Scatter
          data={data}
          fill="#E9541C"
          opacity={0.8}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ─── 재원 시간 바 차트 ──────────────────────────────────
export function StudyHoursChart({ students }: { students: StudentAnalytics[] }) {
  const data = students
    .filter((s) => s.studyHours > 0)
    .sort((a, b) => b.studyHours - a.studyHours)
    .slice(0, 15)
    .map((s) => ({ name: s.studentName, hours: s.studyHours }));

  if (data.length === 0) return <EmptyState text="출퇴실 기록이 없습니다" />;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFEFEC" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 11 }} unit="h" />
        <Tooltip formatter={(v) => [`${v}시간`, "총 재원 시간"]} />
        <Bar dataKey="hours" fill="#E9541C" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── 개인 과목별 성적 추이 라인 차트 ────────────────────
export function SubjectTrendChart({ student }: { student: StudentAnalytics }) {
  const subjects = student.subjects.filter(
    (s) => s.firstGrade !== null && s.latestGrade !== null && s.firstDate !== s.latestDate
  );

  if (subjects.length === 0) return <EmptyState text="성적 추이 데이터 없음" />;

  const data = [
    { label: "처음", ...Object.fromEntries(subjects.map((s) => [s.subject, s.firstGrade])) },
    { label: "최근", ...Object.fromEntries(subjects.map((s) => [s.subject, s.latestGrade])) },
  ];

  const COLORS = ["#E9541C", "#2E9D6B", "#C28327", "#D14343", "#6E5BD0"];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 12, left: -20, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEC" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis reversed tick={{ fontSize: 11 }} domain={[1, 9]} ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9]} />
        <Tooltip formatter={(v) => [`${v}등급`]} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {subjects.map((s, i) => (
          <Line
            key={s.subject}
            type="monotone"
            dataKey={s.subject}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── 개인 성적 테이블 ───────────────────────────────────
export function SubjectTable({ student }: { student: StudentAnalytics }) {
  if (student.subjects.length === 0) return <EmptyState text="성적 데이터 없음" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="text-left py-2 font-medium">과목</th>
            <th className="text-center py-2 font-medium">처음</th>
            <th className="text-center py-2 font-medium">최근</th>
            <th className="text-center py-2 font-medium">변화</th>
          </tr>
        </thead>
        <tbody>
          {student.subjects.map((s) => (
            <tr key={s.subject} className="border-b last:border-0">
              <td className="py-2 font-medium">{s.subject}</td>
              <td className="py-2 text-center text-muted-foreground">
                {s.firstGrade ? `${s.firstGrade}등급` : "-"}
              </td>
              <td className="py-2 text-center text-muted-foreground">
                {s.latestGrade ? `${s.latestGrade}등급` : "-"}
              </td>
              <td className="py-2 text-center">
                {s.improvement !== null ? (
                  <span className={cn(
                    "font-semibold text-xs px-1.5 py-0.5 rounded",
                    s.improvement > 0 ? "text-emerald-700 bg-emerald-50" :
                    s.improvement < 0 ? "text-red-700 bg-red-50" :
                    "text-muted-foreground bg-muted"
                  )}>
                    {s.improvement > 0 ? `▲ ${s.improvement}등급` :
                     s.improvement < 0 ? `▼ ${Math.abs(s.improvement)}등급` : "변동없음"}
                  </span>
                ) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">{text}</div>
  );
}
