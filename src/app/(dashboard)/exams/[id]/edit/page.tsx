import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, Section } from "@/components/backoffice/ui";
import { ExamSessionForm } from "@/components/exams/exam-session-form";

export default async function EditExamSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await prisma.examSession.findUnique({ where: { id } });
  if (!session) notFound();

  return (
    <div>
      <PageHeader
        back={{ href: `/exams/${id}`, label: "세션 상세" }}
        title="시험 세션 수정"
        description={session.title}
      />
      <Section className="max-w-3xl">
        <ExamSessionForm
          mode="edit"
          initial={{
            id: session.id,
            title: session.title,
            examDate: session.examDate.toISOString().slice(0, 10),
            examType: session.examType,
            subjects: session.subjects,
            notes: session.notes ?? "",
          }}
        />
      </Section>
    </div>
  );
}
