import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { validateMagicLink } from "@/lib/student-auth";
import { QuestionForm } from "../_components/question-form";

export default async function NewStudentQuestionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await validateMagicLink(token);
  if (!session) redirect("/s/expired");

  return (
    <div className="space-y-4">
      <Link
        href={`/s/${token}/qna`}
        className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-4 active:text-ink-2"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        질문 목록
      </Link>
      <h1 className="text-[18px] font-bold tracking-[-0.02em] text-ink">새 질문</h1>
      <QuestionForm token={token} />
    </div>
  );
}
