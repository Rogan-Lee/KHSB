import { Card, CardContent } from "@/components/ui/card";
import { PageIntro } from "@/components/ui/page-intro";
import { ExamSessionForm } from "@/components/exams/exam-session-form";

export default function NewExamSessionPage() {
  return (
    <div className="space-y-4">
      <PageIntro
        tag="EXAMS · NEW"
        title="시험 세션 생성"
        description="시험 정보를 입력하면 이어서 응시자 선택 및 좌석 배치가 가능합니다"
        accent="text-info"
      />
      <Card>
        <CardContent className="pt-4">
          <ExamSessionForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
