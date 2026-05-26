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
// 데이터분석 관점 개선:
//  · X/Y 축을 type="number"로 → 카테고리 정렬이 아닌 실제 수치 위치에 플롯
//    (직전 버전은 type 미지정 → 배열 순서대로 그려져 상관관계가 안 보였음)
//  · 최소제곱 선형 회귀선 + 피어슨 상관계수 r 표시 → 관계 방향·강도 정량화
//  · 표본 크기 N 표시, 정수 눈금, 도메인 [0, max]
export function CorrelationScatter({ data }: { data: OverallAnalytics["correlationPoints"] }) {
  if (data.length === 0) return <EmptyState text="데이터가 없습니다" />;

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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
        <span>표본 N = {n}명</span>
        <span>{corrLabel}</span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 4, right: 12, left: 0, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEC" />
          <XAxis
            type="number"
            dataKey="mentoringCount"
            name="멘토링 횟수"
            domain={[0, xDomainMax]}
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            label={{ value: "멘토링 횟수 (회)", position: "insideBottom", offset: -4, fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="avgImprovement"
            name="등급 상승"
            tick={{ fontSize: 11 }}
            label={{ value: "등급 상승", angle: -90, position: "insideLeft", offset: 12, fontSize: 11 }}
          />
          {/* y=0 (변화 없음) 기준선 */}
          <ReferenceLine y={0} stroke="#D8D9DC" strokeDasharray="3 3" />
          {/* 최소제곱 회귀선 */}
          {canShowTrend && (
            <ReferenceLine
              segment={[
                { x: 0, y: intercept },
                { x: xDomainMax, y: slope * xDomainMax + intercept },
              ]}
              stroke="#2E9D6B"
              strokeWidth={1.5}
              ifOverflow="hidden"
            />
          )}
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
          <Scatter data={data} fill="#E9541C" opacity={0.7} />
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
