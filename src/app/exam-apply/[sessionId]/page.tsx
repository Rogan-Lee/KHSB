import { prisma } from "@/lib/prisma";
import { EXAM_TYPE_LABELS } from "@/components/exams/exam-type-label";
import { ExamApplyForm } from "./_components/exam-apply-form";

export const dynamic = "force-dynamic";

export default async function ExamApplyPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const exam = await prisma.examSession.findUnique({
    where: { id: sessionId },
    select: { id: true, title: true, examDate: true, examType: true, applicationOpen: true },
  });

  // 신청 접수 여부는 운영진이 켜는 applicationOpen 하나로 판단 (열면 열린 걸로 보임).
  const closed = !exam || !exam.applicationOpen;

  return (
    <div className="mx-auto min-h-screen max-w-md px-5 py-10">
      <h1 className="text-xl font-bold text-gray-900">모의고사 신청</h1>
      {exam && (
        <p className="mt-1 text-sm text-gray-500">
          {exam.title} · {EXAM_TYPE_LABELS[exam.examType]} · {exam.examDate.toISOString().slice(0, 10)}
        </p>
      )}

      {closed ? (
        <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          현재 신청을 받지 않는 시험입니다.
        </div>
      ) : (
        <ExamApplyForm sessionId={exam!.id} />
      )}
    </div>
  );
}
