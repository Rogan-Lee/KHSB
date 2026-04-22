import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { PageIntro } from "@/components/ui/page-intro";
import { ExamSessionForm } from "@/components/exams/exam-session-form";
import { ChevronLeft } from "lucide-react";

export default async function EditExamSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await prisma.examSession.findUnique({ where: { id } });
  if (!session) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/exams/${id}`} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="h-3 w-3" />
          세션 상세
        </Link>
      </div>
      <PageIntro tag="EXAMS · EDIT" title="시험 세션 수정" accent="text-info" />
      <Card>
        <CardContent className="pt-4">
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
        </CardContent>
      </Card>
    </div>
  );
}
