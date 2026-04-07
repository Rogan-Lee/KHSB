"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp, Clock, BookOpen, BarChart3,
  Users, Award, Brain, Search, ChevronDown,
} from "lucide-react";
import {
  ImprovementBarChart,
  CorrelationScatter,
  StudyHoursChart,
  SubjectTrendChart,
  SubjectTable,
} from "./analytics-charts";
import { cn } from "@/lib/utils";
import type { OverallAnalytics, StudentAnalytics } from "@/actions/analytics";

function gradeColor(g: number) {
  if (g <= 2) return "text-emerald-700 bg-emerald-50";
  if (g <= 4) return "text-blue-700 bg-blue-50";
  if (g <= 6) return "text-amber-700 bg-amber-50";
  return "text-red-700 bg-red-50";
}

export function AnalyticsDashboard({ data }: { data: OverallAnalytics }) {
  const [tab, setTab] = useState<"overview" | "individual">("overview");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comboOpen, setComboOpen] = useState(false);

  const studentsWithScores = useMemo(
    () => data.students.filter((s) => s.subjects.length > 0),
    [data.students]
  );

  const searchResults = useMemo(() => {
    if (!search) return studentsWithScores;
    return studentsWithScores.filter((s) =>
      s.studentName.includes(search) || s.grade.includes(search)
    );
  }, [studentsWithScores, search]);

  const selectedStudent = selectedId
    ? data.students.find((s) => s.studentId === selectedId) ?? null
    : null;

  const kpis = [
    {
      label: "평균 성적 상승",
      value: data.avgImprovement !== null ? `+${data.avgImprovement}등급` : "데이터 없음",
      sub: "재원 기간 평균",
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50 border-emerald-100",
    },
    {
      label: "평균 상승 소요 기간",
      value: data.avgDaysToImprovement !== null ? `${data.avgDaysToImprovement}일` : "데이터 없음",
      sub: "첫 시험 → 최근 시험",
      icon: Clock,
      color: "text-blue-600",
      bg: "bg-blue-50 border-blue-100",
    },
    {
      label: "평균 총 재원 시간",
      value: data.avgStudyHoursPerMonth !== null ? `${data.avgStudyHoursPerMonth}h` : "데이터 없음",
      sub: "출퇴실 기록 기준",
      icon: BookOpen,
      color: "text-violet-600",
      bg: "bg-violet-50 border-violet-100",
    },
    {
      label: "분석 대상 학생",
      value: `${data.students.length}명`,
      sub: `성적 등록 ${studentsWithScores.length}명`,
      icon: Users,
      color: "text-amber-600",
      bg: "bg-amber-50 border-amber-100",
    },
  ];

  const tabs = [
    { key: "overview" as const, label: "전체 현황" },
    { key: "individual" as const, label: "개인별 추이" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">성과 분석</h2>
        <p className="text-sm text-muted-foreground mt-1">전체 학생의 성적 추이 및 학습 효율 분석</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-3 pt-5 pb-5">
              <div className={cn("p-2 rounded-xl border shrink-0", k.bg)}>
                <k.icon className={cn("h-5 w-5", k.color)} />
              </div>
              <div>
                <p className={cn("text-xl font-bold tracking-tight", k.color)}>{k.value}</p>
                <p className="text-xs text-muted-foreground leading-tight">{k.label}</p>
                <p className="text-[10px] text-muted-foreground/60">{k.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 탭 */}
      <div className="flex border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 전체 현황 탭 */}
      {tab === "overview" && (
        <>
          {/* 차트 2열 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">학생별 평균 등급 변화</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[11px] text-muted-foreground mb-3">
                  ▲ 양수 = 등급 상승, 음수 = 등급 하락 · 시험 2회 이상 학생만 표시
                </p>
                <ImprovementBarChart students={data.students} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <Brain className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">멘토링 횟수 vs 성적 상관관계</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[11px] text-muted-foreground mb-3">
                  오른쪽 위 = 멘토링 많고 성적 상승 · 각 점 = 학생 1명
                </p>
                <CorrelationScatter data={data.correlationPoints} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">학생별 총 재원 시간</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[11px] text-muted-foreground mb-3">
                  출입 기록(checkIn~checkOut) 합산 · 최대 15명
                </p>
                <StudyHoursChart students={data.students} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <Award className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">성적 상승 상위 학생</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.students
                    .filter((s) => s.avgImprovement !== null && s.avgImprovement > 0)
                    .sort((a, b) => (b.avgImprovement ?? 0) - (a.avgImprovement ?? 0))
                    .slice(0, 8)
                    .map((s, i) => (
                      <div key={s.studentId} className="flex items-center gap-3">
                        <span className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                          i === 0 ? "bg-amber-100 text-amber-700" :
                          i === 1 ? "bg-slate-100 text-slate-600" :
                          i === 2 ? "bg-orange-100 text-orange-600" :
                          "bg-muted text-muted-foreground"
                        )}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{s.studentName}</span>
                            <span className="text-xs font-semibold text-emerald-600">+{s.avgImprovement}등급</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{s.grade} · 멘토링 {s.mentoringCount}회 · {s.studyHours}h</p>
                        </div>
                      </div>
                    ))}
                  {data.students.filter((s) => s.avgImprovement !== null && s.avgImprovement > 0).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">시험 2회 이상 등록된 학생이 없습니다</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 개인별 상세 테이블 — 현재 등급 포함 */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 pb-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">개인별 상세 현황</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 font-medium">이름</th>
                      <th className="text-left py-2 font-medium">학년</th>
                      <th className="text-left py-2 font-medium">현재 등급</th>
                      <th className="text-center py-2 font-medium">평균 등급 변화</th>
                      <th className="text-center py-2 font-medium">기간</th>
                      <th className="text-center py-2 font-medium">멘토링 횟수</th>
                      <th className="text-center py-2 font-medium">총 재원</th>
                      <th className="text-left py-2 font-medium">과목</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((s) => {
                      const latestGrades = s.subjects.filter((sub) => sub.latestGrade !== null);
                      return (
                        <tr key={s.studentId} className="border-b last:border-0 hover:bg-accent/30 cursor-pointer" onClick={() => { setSelectedId(s.studentId); setTab("individual"); }}>
                          <td className="py-2.5 font-medium">{s.studentName}</td>
                          <td className="py-2.5 text-muted-foreground">{s.grade}</td>
                          <td className="py-2.5">
                            {latestGrades.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {latestGrades.map((sub) => (
                                  <span key={sub.subject} className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", gradeColor(sub.latestGrade!))}>
                                    {sub.subject} {sub.latestGrade}
                                  </span>
                                ))}
                              </div>
                            ) : <span className="text-muted-foreground">-</span>}
                          </td>
                          <td className="py-2.5 text-center">
                            {s.avgImprovement !== null ? (
                              <span className={cn(
                                "text-xs font-semibold px-2 py-0.5 rounded-full",
                                s.avgImprovement > 0 ? "bg-emerald-50 text-emerald-700" :
                                s.avgImprovement < 0 ? "bg-red-50 text-red-700" :
                                "bg-muted text-muted-foreground"
                              )}>
                                {s.avgImprovement > 0 ? `+${s.avgImprovement}` : s.avgImprovement}등급
                              </span>
                            ) : <span className="text-muted-foreground">-</span>}
                          </td>
                          <td className="py-2.5 text-center text-muted-foreground text-xs">
                            {s.daysToImprovement !== null ? `${s.daysToImprovement}일` : "-"}
                          </td>
                          <td className="py-2.5 text-center text-muted-foreground">{s.mentoringCount}회</td>
                          <td className="py-2.5 text-center text-muted-foreground">{s.studyHours > 0 ? `${s.studyHours}h` : "-"}</td>
                          <td className="py-2.5 text-xs text-muted-foreground">
                            {s.subjects.map((sub) => sub.subject).join(", ") || "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* 개인별 추이 탭 */}
      {tab === "individual" && (
        <div className="space-y-4">
          {/* 학생 검색 */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="학생 이름 검색..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setComboOpen(true); setSelectedId(null); }}
              onFocus={() => setComboOpen(true)}
              className="w-full pl-9 pr-8 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button onClick={() => setComboOpen(!comboOpen)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground">
              <ChevronDown className={cn("h-4 w-4 transition-transform", comboOpen && "rotate-180")} />
            </button>

            {comboOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground text-center">검색 결과 없음</p>
                ) : (
                  searchResults.map((s) => (
                    <button
                      key={s.studentId}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between",
                        selectedId === s.studentId && "bg-accent"
                      )}
                      onClick={() => { setSelectedId(s.studentId); setSearch(s.studentName); setComboOpen(false); }}
                    >
                      <span className="font-medium">{s.studentName}</span>
                      <span className="text-xs text-muted-foreground">{s.grade} · {s.subjects.length}과목</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 선택된 학생 상세 */}
          {selectedStudent && selectedStudent.subjects.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{selectedStudent.studentName}</CardTitle>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{selectedStudent.grade}</span>
                    {selectedStudent.school && <span>· {selectedStudent.school}</span>}
                    <span>· 멘토링 {selectedStudent.mentoringCount}회</span>
                    {selectedStudent.studyHours > 0 && <span>· {selectedStudent.studyHours}h</span>}
                  </div>
                </div>
                {/* 현재 등급 배지 */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedStudent.subjects.filter((s) => s.latestGrade !== null).map((s) => (
                    <span key={s.subject} className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", gradeColor(s.latestGrade!))}>
                      {s.subject} {s.latestGrade}등급
                      {s.improvement !== null && s.improvement !== 0 && (
                        <span className={s.improvement > 0 ? " text-emerald-600" : " text-red-500"}>
                          {" "}{s.improvement > 0 ? `+${s.improvement}` : s.improvement}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <SubjectTrendChart student={selectedStudent} />
                <SubjectTable student={selectedStudent} />
              </CardContent>
            </Card>
          ) : selectedStudent ? (
            <p className="text-sm text-muted-foreground text-center py-12">이 학생은 등록된 성적이 없습니다.</p>
          ) : (
            /* 전체 목록 (검색 안 했을 때) */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {studentsWithScores.map((s) => (
                <Card key={s.studentId} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setSelectedId(s.studentId); setSearch(s.studentName); }}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{s.studentName}</CardTitle>
                      <span className="text-xs text-muted-foreground">{s.grade}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.subjects.filter((sub) => sub.latestGrade !== null).map((sub) => (
                        <span key={sub.subject} className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", gradeColor(sub.latestGrade!))}>
                          {sub.subject} {sub.latestGrade}
                        </span>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <SubjectTrendChart student={s} />
                    <SubjectTable student={s} />
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t">
                      <span>멘토링 {s.mentoringCount}회</span>
                      <span>재원 {s.studyHours > 0 ? `${s.studyHours}h` : "-"}</span>
                      {s.daysToImprovement && <span>{s.daysToImprovement}일 경과</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {studentsWithScores.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12 col-span-2">등록된 성적이 없습니다</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
