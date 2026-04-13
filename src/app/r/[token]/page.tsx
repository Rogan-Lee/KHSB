import { notFound } from "next/navigation";
import { getParentReport } from "@/actions/parent-reports";
import { getStudentAnalytics } from "@/actions/analytics";
import { BookOpen, GraduationCap, User, Calendar, Clock, CheckCircle2, TrendingUp, TrendingDown, Target, FileText, MessageSquare, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";

export default async function ParentReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await getParentReport(token);

  if (!report) notFound();

  const { student, mentoring, studyPlanNote, studyPlanImages, customNote } = report;

  const analytics = await getStudentAnalytics(student.id);

  const dateStr = mentoring
    ? new Date(mentoring.actualDate ?? mentoring.scheduledAt).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      })
    : new Date(report.createdAt).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      });

  const timeStr =
    mentoring?.actualStartTime && mentoring?.actualEndTime
      ? `${mentoring.actualStartTime} ~ ${mentoring.actualEndTime}`
      : null;

  const hasMentoringContent =
    mentoring &&
    (mentoring.content || mentoring.improvements || mentoring.weaknesses || mentoring.nextGoals || mentoring.notes);

  const hasStudyPlan = studyPlanNote || (studyPlanImages && studyPlanImages.length > 0);

  return (
    <div className="min-h-screen bg-[#f5f6fa]">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-sm">
            <BookOpen className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <p className="font-bold text-[15px] text-gray-900 leading-tight">KHSB 멘토링 리포트</p>
            <p className="text-[11px] text-gray-400">학부모 안내 자료</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {/* 원생 기본 정보 카드 */}
        <div className="bg-blue-600 rounded-2xl p-5 text-white shadow-md">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-blue-200 text-[11px] font-medium tracking-wide uppercase mb-1">원생</p>
              <p className="text-2xl font-bold leading-tight">{student.name}</p>
              <p className="text-blue-200 text-sm mt-0.5">
                {student.grade}{student.school ? ` · ${student.school}` : ""}
              </p>
            </div>
            {mentoring?.status === "COMPLETED" && (
              <span className="flex items-center gap-1 bg-white/20 backdrop-blur rounded-full px-2.5 py-1 text-xs font-semibold shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5" />
                완료
              </span>
            )}
          </div>

          <div className="border-t border-blue-500/60 pt-4 space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-blue-300 shrink-0" />
              <p className="text-sm text-blue-100">{dateStr}</p>
            </div>
            {timeStr && (
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-blue-300 shrink-0" />
                <p className="text-sm text-blue-100">{timeStr}</p>
              </div>
            )}
            {mentoring?.mentor && (
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-blue-300 shrink-0" />
                <p className="text-sm text-blue-100">{mentoring.mentor.name} 멘토</p>
              </div>
            )}
          </div>
        </div>

        {/* 멘토 안내사항 */}
        {customNote && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">멘토 안내사항</p>
            </div>
            <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">{customNote}</p>
          </div>
        )}

        {/* 멘토링 내용 */}
        {hasMentoringContent && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                <p className="text-sm font-bold text-gray-800">멘토링 내용</p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {mentoring!.content && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">오늘 멘토링 내용</p>
                  <div className="text-sm text-gray-800 leading-relaxed">
                    <MarkdownViewer source={mentoring!.content} />
                  </div>
                </div>
              )}

              {(mentoring!.improvements || mentoring!.weaknesses) && (
                <div className="grid grid-cols-2 gap-3">
                  {mentoring!.improvements && (
                    <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        <p className="text-[11px] font-semibold text-green-700">개선된 점</p>
                      </div>
                      <div className="text-sm text-gray-700 leading-relaxed"><MarkdownViewer source={mentoring!.improvements} /></div>
                    </div>
                  )}
                  {mentoring!.weaknesses && (
                    <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <TrendingDown className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                        <p className="text-[11px] font-semibold text-orange-700">보완할 점</p>
                      </div>
                      <div className="text-sm text-gray-700 leading-relaxed"><MarkdownViewer source={mentoring!.weaknesses} /></div>
                    </div>
                  )}
                </div>
              )}

              {mentoring!.nextGoals && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Target className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">다음 멘토링 목표</p>
                  </div>
                  <div className="text-sm text-gray-800 leading-relaxed"><MarkdownViewer source={mentoring!.nextGoals} /></div>
                </div>
              )}

              {mentoring!.notes && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">기타 메모</p>
                  <div className="text-sm text-gray-700 leading-relaxed"><MarkdownViewer source={mentoring!.notes} /></div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 학습 계획 */}
        {hasStudyPlan && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-purple-500 shrink-0" />
                <p className="text-sm font-bold text-gray-800">학습 계획</p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {studyPlanNote && (
                <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">{studyPlanNote}</p>
              )}
              {studyPlanImages && studyPlanImages.length > 0 && (
                <div className="space-y-3">
                  {studyPlanImages.map((url, i) => (
                    <div key={i} className="rounded-xl overflow-hidden border border-gray-100 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`학습 계획 ${i + 1}`}
                        className="w-full h-auto"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 성적 현황 */}
        {analytics && analytics.subjects.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-500 shrink-0" />
                <p className="text-sm font-bold text-gray-800">성적 현황</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* stats row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-indigo-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-indigo-700">
                    {analytics.avgImprovement !== null
                      ? `${analytics.avgImprovement > 0 ? "+" : ""}${analytics.avgImprovement}`
                      : "-"}
                  </p>
                  <p className="text-[10px] text-indigo-500 mt-0.5">평균 등급 변화</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-emerald-700">
                    {analytics.mentoringCount}회
                  </p>
                  <p className="text-[10px] text-emerald-500 mt-0.5">멘토링 횟수</p>
                </div>
                <div className="bg-violet-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-violet-700">
                    {analytics.studyHours > 0 ? `${analytics.studyHours}h` : "-"}
                  </p>
                  <p className="text-[10px] text-violet-500 mt-0.5">총 재원 시간</p>
                </div>
              </div>

              {/* subject table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-400">
                    <th className="text-left py-2 font-medium">과목</th>
                    <th className="text-center py-2 font-medium">처음</th>
                    <th className="text-center py-2 font-medium">최근</th>
                    <th className="text-center py-2 font-medium">변화</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.subjects.map((s) => (
                    <tr key={s.subject} className="border-b last:border-0">
                      <td className="py-2 font-medium text-gray-800">{s.subject}</td>
                      <td className="py-2 text-center text-gray-400 text-xs">
                        {s.firstGrade ? `${s.firstGrade}등급` : "-"}
                      </td>
                      <td className="py-2 text-center text-gray-400 text-xs">
                        {s.latestGrade ? `${s.latestGrade}등급` : "-"}
                      </td>
                      <td className="py-2 text-center">
                        {s.improvement !== null ? (
                          <span className={cn(
                            "font-semibold text-xs px-1.5 py-0.5 rounded",
                            s.improvement > 0 ? "text-emerald-700 bg-emerald-50" :
                            s.improvement < 0 ? "text-red-700 bg-red-50" :
                            "text-gray-500 bg-gray-100"
                          )}>
                            {s.improvement > 0 ? `▲ ${s.improvement}` :
                             s.improvement < 0 ? `▼ ${Math.abs(s.improvement)}` : "변동없음"}
                          </span>
                        ) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 푸터 */}
        <div className="flex items-center justify-center gap-2 py-6">
          <GraduationCap className="h-3.5 w-3.5 text-gray-300" />
          <p className="text-xs text-gray-300">KHSB BackOffice · 관리형 독서실</p>
        </div>
      </div>
    </div>
  );
}
