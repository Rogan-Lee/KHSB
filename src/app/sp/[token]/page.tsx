import { notFound } from "next/navigation";
import { getStudyPlanReport } from "@/actions/study-plan-reports";
import { BookOpen, GraduationCap, Calendar, ClipboardList } from "lucide-react";

export default async function StudyPlanReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await getStudyPlanReport(token);

  if (!report) notFound();

  const { student, images, createdAt } = report;

  const dateStr = new Date(createdAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="min-h-screen bg-[#f5f6fa]">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center shrink-0 shadow-sm">
            <ClipboardList className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <p className="font-bold text-[15px] text-gray-900 leading-tight">KHSB 공부 계획</p>
            <p className="text-[11px] text-gray-400">학부모 안내 자료</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {/* 원생 기본 정보 카드 */}
        <div className="bg-purple-600 rounded-2xl p-5 text-white shadow-md">
          <div className="mb-4">
            <p className="text-purple-200 text-[11px] font-medium tracking-wide uppercase mb-1">원생</p>
            <p className="text-2xl font-bold leading-tight">{student.name}</p>
            <p className="text-purple-200 text-sm mt-0.5">
              {student.grade}{student.school ? ` · ${student.school}` : ""}
            </p>
          </div>
          <div className="border-t border-purple-500/60 pt-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-purple-300 shrink-0" />
              <p className="text-sm text-purple-100">{dateStr}</p>
            </div>
          </div>
        </div>

        {/* 공부 계획 이미지 */}
        {images.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <div className="px-5 py-4 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-purple-500 shrink-0" />
                <p className="text-sm font-bold text-gray-800">공부 계획표</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {images.map((url, i) => (
                <div key={i} className="rounded-xl overflow-hidden border border-gray-100 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`공부 계획 ${i + 1}`}
                    className="w-full h-auto"
                  />
                </div>
              ))}
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
