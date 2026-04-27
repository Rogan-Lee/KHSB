import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyAttendanceDonut } from "@/components/reports/monthly-attendance-donut";
import { Clock, TrendingUp, TrendingDown } from "lucide-react";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatMinutes(minutes: number): string {
  const h = minutes / 60;
  const hRounded = round2(h);
  if (hRounded < 1) return `${Math.round(minutes)}분`;
  return `${hRounded}시간`;
}

function diffSign(curr: number, prev: number | null): { sign: "up" | "down" | "same"; diff: number } {
  if (prev == null) return { sign: "same", diff: 0 };
  if (curr > prev) return { sign: "up", diff: curr - prev };
  if (curr < prev) return { sign: "down", diff: prev - curr };
  return { sign: "same", diff: 0 };
}

export type StudyAnalysis = {
  grade: string;
  attendanceDays: number;
  absentDays: number;
  tardyCount: number;
  earlyLeaveCount: number;
  totalStudyMinutes: number;
  prevMonthStudyMinutes: number;
  gradeAvgMinutes: number;
  outingCount: number;
  studyRankInRoom: number | null;
  studyRankTotal: number | null;
};

interface Props {
  studentName: string;
  year: number;
  month: number;
  analysis: StudyAnalysis;
}

export function StudyQuantityPanel({ studentName, year, month, analysis }: Props) {
  const studyDiff = diffSign(analysis.totalStudyMinutes, analysis.prevMonthStudyMinutes);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-blue-600" />
          학습 정량 분석
          <span className="text-xs font-normal text-muted-foreground ml-1">
            {year}년 {month}월
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          {/* 순공 시간 + 전월 비교 */}
          <div className="rounded-lg bg-blue-50 p-4">
            <p className="text-xs text-muted-foreground">월간 총 순공 시간</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{formatMinutes(analysis.totalStudyMinutes)}</p>
            {analysis.prevMonthStudyMinutes > 0 && (
              <div className="flex items-center gap-1 mt-2 text-xs">
                {studyDiff.sign === "up" && (
                  <span className="flex items-center gap-1 text-emerald-700">
                    <TrendingUp className="h-3 w-3" />
                    전월 대비 +{formatMinutes(studyDiff.diff)}
                  </span>
                )}
                {studyDiff.sign === "down" && (
                  <span className="flex items-center gap-1 text-red-600">
                    <TrendingDown className="h-3 w-3" />
                    전월 대비 -{formatMinutes(studyDiff.diff)}
                  </span>
                )}
                {studyDiff.sign === "same" && (
                  <span className="text-muted-foreground">전월과 동일</span>
                )}
              </div>
            )}
            {analysis.studyRankInRoom != null && analysis.studyRankTotal != null && (
              <p className="text-[11px] text-muted-foreground mt-2">
                전체 순위 {analysis.studyRankInRoom}/{analysis.studyRankTotal}
              </p>
            )}
          </div>

          {/* 학년 평균 비교 */}
          {analysis.gradeAvgMinutes > 0 ? (
            <div className="rounded-lg border p-4 md:col-span-2">
              <p className="text-xs text-muted-foreground mb-2">{analysis.grade} 평균 학습 시간과 비교</p>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">{studentName}</span>
                    <span>{formatMinutes(analysis.totalStudyMinutes)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{
                        width: `${Math.min(
                          100,
                          (analysis.totalStudyMinutes /
                            Math.max(analysis.totalStudyMinutes, analysis.gradeAvgMinutes)) *
                            100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{analysis.grade} 평균</span>
                    <span className="text-muted-foreground">{formatMinutes(analysis.gradeAvgMinutes)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-400"
                      style={{
                        width: `${Math.min(
                          100,
                          (analysis.gradeAvgMinutes /
                            Math.max(analysis.totalStudyMinutes, analysis.gradeAvgMinutes)) *
                            100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border p-4 md:col-span-2 flex items-center justify-center text-xs text-muted-foreground">
              학년 평균 비교 데이터가 아직 없습니다
            </div>
          )}
        </div>

        {/* 출결 현황 */}
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground mb-3">출결 · 외출 현황</p>
          <MonthlyAttendanceDonut
            normal={analysis.attendanceDays}
            tardy={analysis.tardyCount}
            absent={analysis.absentDays}
            earlyLeave={analysis.earlyLeaveCount}
            outingCount={analysis.outingCount}
          />
        </div>
      </CardContent>
    </Card>
  );
}
