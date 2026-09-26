import { PageHeader, Section } from "@/components/backoffice/ui";
import { ExamSessionForm } from "@/components/exams/exam-session-form";
import { requireDashboardSession } from "../../_lib/page-guard";

export default async function NewExamSessionPage() {
  await requireDashboardSession();
  return (
    <div>
      <PageHeader
        back={{ href: "/exams", label: "시험 관리" }}
        title="시험 세션 생성"
        description="시험 정보를 입력하면 이어서 응시자 선택과 좌석 배치를 할 수 있어요"
      />
      <Section className="max-w-3xl">
        <ExamSessionForm mode="create" />
      </Section>
    </div>
  );
}
