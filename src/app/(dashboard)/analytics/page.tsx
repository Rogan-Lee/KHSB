import { getOverallAnalytics } from "@/actions/analytics";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp, Clock, BookOpen, BarChart3,
  Users, Award, Brain,
} from "lucide-react";
import {
  ImprovementBarChart,
  CorrelationScatter,
  StudyHoursChart,
  SubjectTrendChart,
  SubjectTable,
} from "@/components/analytics/analytics-charts";
import { cn } from "@/lib/utils";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (session.user.role !== "DIRECTOR" && session.user.role !== "ADMIN") redirect("/");

  const data = await getOverallAnalytics();

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
      sub: "재원 중인 학생",
      icon: Users,
      color: "text-amber-600",
      bg: "bg-amber-50 border-amber-100",
    },
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

      {/* 차트 2열 */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">학생별 평균 등급 변화</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[11px] text-muted-foreground mb-3">
              ▲ 양수 = 등급 하락(상승), 음수 = 등급 상승(하락) · 최대 15명 표시
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
                <p className="text-sm text-muted-foreground text-center py-8">성적 데이터가 없습니다</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 개인별 상세 테이블 */}
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
                  <th className="text-center py-2 font-medium">평균 등급 변화</th>
                  <th className="text-center py-2 font-medium">기간</th>
                  <th className="text-center py-2 font-medium">멘토링 횟수</th>
                  <th className="text-center py-2 font-medium">총 재원</th>
                  <th className="text-left py-2 font-medium">과목</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.studentId} className="border-b last:border-0 hover:bg-accent/30">
                    <td className="py-2.5 font-medium">{s.studentName}</td>
                    <td className="py-2.5 text-muted-foreground">{s.grade}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 개인별 과목 추이 */}
      {data.students.filter((s) => s.subjects.length > 0).length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">개인별 과목 추이</h3>
          <div className="grid grid-cols-2 gap-4">
            {data.students
              .filter((s) => s.subjects.length > 0)
              .map((s) => (
                <Card key={s.studentId}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{s.studentName}</CardTitle>
                      <span className="text-xs text-muted-foreground">{s.grade}</span>
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
          </div>
        </div>
      )}
    </div>
  );
}
