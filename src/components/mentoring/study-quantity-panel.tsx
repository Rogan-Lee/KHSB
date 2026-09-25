import { MonthlyAttendanceDonut } from "@/components/reports/monthly-attendance-donut";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Section, StatCard } from "@/components/backoffice/ui";

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
  const barMax = Math.max(analysis.totalStudyMinutes, analysis.gradeAvgMinutes);

  return (
    <Section
      title="학습 정량 분석"
      description={`${year}년 ${month}월 · 원생과 함께 보면서 멘토링 자료로 써요`}
    >
      <div className="flex flex-col gap-x3">
        <div className="grid grid-cols-1 gap-x3 md:grid-cols-3">
          {/* 순공 시간 + 전월 비교 */}
          <StatCard
            label="월간 총 순공 시간"
            value={formatMinutes(analysis.totalStudyMinutes)}
            sub={
              <div className="flex flex-col gap-x1">
                {analysis.prevMonthStudyMinutes > 0 && (
                  <>
                    {studyDiff.sign === "up" && (
                      <span className="inline-flex items-center gap-x1 text-fg-positive">
                        <TrendingUp className="size-3.5" aria-hidden />
                        전월 대비 +{formatMinutes(studyDiff.diff)}
                      </span>
                    )}
                    {studyDiff.sign === "down" && (
                      <span className="inline-flex items-center gap-x1 text-fg-critical">
                        <TrendingDown className="size-3.5" aria-hidden />
                        전월 대비 -{formatMinutes(studyDiff.diff)}
                      </span>
                    )}
                    {studyDiff.sign === "same" && <span>전월과 동일</span>}
                  </>
                )}
                {analysis.studyRankInRoom != null && analysis.studyRankTotal != null && (
                  <span>전체 순위 {analysis.studyRankInRoom}/{analysis.studyRankTotal}</span>
                )}
              </div>
            }
          />

          {/* 학년 평균 비교 */}
          {analysis.gradeAvgMinutes > 0 ? (
            <div className="rounded-r4 bg-bg-layer-fill px-x5 py-x4 md:col-span-2">
              <p className="t4-medium text-fg-neutral-subtle">{analysis.grade} 평균 학습 시간과 비교</p>
              <div className="mt-x3 flex flex-col gap-x3">
                <div>
                  <div className="mb-x1_5 flex justify-between t3-regular">
                    <span className="t3-bold text-fg-neutral">{studentName}</span>
                    <span className="tabular-nums text-fg-neutral">{formatMinutes(analysis.totalStudyMinutes)}</span>
                  </div>
                  <div className="h-x2 overflow-hidden rounded-full bg-bg-neutral-weak">
                    <div
                      className="h-full rounded-full bg-bg-brand-solid"
                      style={{ width: `${Math.min(100, (analysis.totalStudyMinutes / barMax) * 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-x1_5 flex justify-between t3-regular text-fg-neutral-subtle">
                    <span>{analysis.grade} 평균</span>
                    <span className="tabular-nums">{formatMinutes(analysis.gradeAvgMinutes)}</span>
                  </div>
                  <div className="h-x2 overflow-hidden rounded-full bg-bg-neutral-weak">
                    <div
                      className="h-full rounded-full bg-bg-neutral-solid-muted"
                      style={{ width: `${Math.min(100, (analysis.gradeAvgMinutes / barMax) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-r4 bg-bg-layer-fill px-x5 py-x4 t3-regular text-fg-neutral-subtle md:col-span-2">
              학년 평균 비교 데이터가 아직 없어요
            </div>
          )}
        </div>

        {/* 출결 현황 */}
        <div className="rounded-r4 bg-bg-layer-fill px-x5 py-x4">
          <p className="mb-x3 t4-medium text-fg-neutral-subtle">출결 · 외출 현황</p>
          <MonthlyAttendanceDonut
            normal={analysis.attendanceDays}
            tardy={analysis.tardyCount}
            absent={analysis.absentDays}
            earlyLeave={analysis.earlyLeaveCount}
            outingCount={analysis.outingCount}
          />
        </div>
      </div>
    </Section>
  );
}
