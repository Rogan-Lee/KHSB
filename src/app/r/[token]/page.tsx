import { notFound } from "next/navigation";
import { getParentReport } from "@/actions/parent-reports";
import { BookOpen, GraduationCap, User, Calendar, Clock, CheckCircle2 } from "lucide-react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-[13px] font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}

export default async function ParentReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await getParentReport(token);

  if (!report) notFound();

  const { student, mentoring, studyPlanNote, studyPlanImages, customNote, createdAt } = report;

  const dateStr = mentoring
    ? new Date(mentoring.actualDate ?? mentoring.scheduledAt).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      })
    : new Date(createdAt).toLocaleDateString("ko-KR", {
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
    (mentoring.content || mentoring.improvements || mentoring.weaknesses || mentoring.nextGoals);

  const hasStudyPlan = studyPlanNote || (studyPlanImages && studyPlanImages.length > 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
            <BookOpen className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-[15px] text-gray-900 leading-none">KHSB 멘토링 리포트</p>
            <p className="text-[11px] text-gray-400 mt-0.5">학부모 안내</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* 기본 정보 */}
        <div className="bg-blue-600 rounded-2xl p-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-blue-200 text-xs font-medium mb-1">원생</p>
              <p className="text-xl font-bold">{student.name}</p>
              <p className="text-blue-200 text-sm mt-0.5">{student.grade}{student.school ? ` · ${student.school}` : ""}</p>
            </div>
            {mentoring?.status === "COMPLETED" && (
              <span className="flex items-center gap-1 bg-white/20 rounded-full px-2.5 py-1 text-xs font-medium shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5" />
                완료
              </span>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-blue-500 grid grid-cols-2 gap-3">
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

        {/* 학부모 안내 메시지 */}
        {customNote && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">멘토 안내사항</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{customNote}</p>
          </div>
        )}

        {/* 멘토링 내용 */}
        {hasMentoringContent && (
          <Section title="멘토링 내용">
            <Field label="오늘 멘토링 내용" value={mentoring!.content} />
            <div className="grid grid-cols-2 gap-3 mt-3">
              {mentoring!.improvements && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">개선된 점</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{mentoring!.improvements}</p>
                </div>
              )}
              {mentoring!.weaknesses && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">보완할 점</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{mentoring!.weaknesses}</p>
                </div>
              )}
            </div>
            {mentoring!.nextGoals && (
              <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-xs font-medium text-blue-600 mb-1">다음 목표</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{mentoring!.nextGoals}</p>
              </div>
            )}
            {mentoring!.notes && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-0.5">메모</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{mentoring!.notes}</p>
              </div>
            )}
          </Section>
        )}

        {/* 학습 계획 */}
        {hasStudyPlan && (
          <Section title="학습 계획">
            {studyPlanNote && (
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed mb-4">{studyPlanNote}</p>
            )}
            {studyPlanImages && studyPlanImages.length > 0 && (
              <div className="space-y-3">
                {studyPlanImages.map((url, i) => (
                  <div key={i} className="rounded-xl overflow-hidden border border-gray-100">
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
          </Section>
        )}

        {/* 푸터 */}
        <div className="flex items-center justify-center gap-2 py-4">
          <GraduationCap className="h-4 w-4 text-gray-300" />
          <p className="text-xs text-gray-300">KHSB BackOffice · 관리형 독서실</p>
        </div>
      </div>
    </div>
  );
}
