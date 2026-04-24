import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { SurveyEditor } from "@/components/online/survey-editor";
import { emptySurveySections } from "@/lib/online/survey-template";

export default async function StudentSurveyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  const survey = await prisma.onboardingSurvey.findUnique({
    where: { studentId: session.student.id },
  });

  const sections =
    (survey?.sections as Record<string, { answer?: string }> | null) ??
    emptySurveySections();

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/s/${token}`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-4 hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          포털 홈
        </Link>
      </div>

      <header>
        <h2 className="text-[16px] font-semibold text-ink">초기 설문</h2>
        <p className="mt-1 text-[12.5px] text-ink-4 leading-relaxed">
          각 섹션에 입력하면 자동으로 저장됩니다. 모두 작성하신 뒤 하단 "설문 제출"을 눌러 주세요.
        </p>
      </header>

      <SurveyEditor
        studentToken={token}
        initialSections={sections}
        isSubmitted={!!survey?.submittedAt}
      />
    </div>
  );
}
