import { notFound } from "next/navigation";
import { getConsultationReport } from "@/actions/consultation-reports";
import { BookOpen, Calendar, User } from "lucide-react";

export default async function ConsultationReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await getConsultationReport(token);
  if (!report) notFound();

  const { consultation, content, recipientName, createdAt } = report;
  const c = consultation as Record<string, unknown>;
  const name = consultation.student?.name ?? (c.prospectName as string) ?? "—";
  const grade = consultation.student?.grade ?? (c.prospectGrade as string) ?? "";

  const dateStr = new Date(createdAt).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  return (
    <div className="min-h-screen bg-[#f5f6fa]">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <BookOpen className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">강한선배 관리형 독서실</h1>
            <p className="text-[11px] text-gray-500">상담 안내</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* 기본 정보 카드 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-violet-500 to-purple-500 px-5 py-4">
            <p className="text-white/80 text-xs font-medium">상담 안내</p>
            <h2 className="text-white text-lg font-bold mt-0.5">
              {recipientName ?? name}님께 드리는 안내
            </h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">대상: </span>
              <span className="font-medium text-gray-900">{name}</span>
              {grade && <span className="text-gray-500 text-xs">({grade})</span>}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">작성일: </span>
              <span className="font-medium text-gray-900">{dateStr}</span>
            </div>
          </div>
        </div>

        {/* 본문 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
            {content}
          </div>
        </div>

        {/* 푸터 */}
        <div className="text-center py-4">
          <p className="text-xs text-gray-400">강한선배 관리형 독서실</p>
          <p className="text-[10px] text-gray-300 mt-1">문의사항은 원장에게 직접 연락 부탁드립니다</p>
        </div>
      </div>
    </div>
  );
}
