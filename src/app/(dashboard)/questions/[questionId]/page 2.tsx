import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { getStaffQuestionThread } from "@/actions/student-questions";
import { StaffQuestionPanel } from "../_components/staff-question-panel";

export default async function StaffQuestionDetailPage({
  params,
}: {
  params: Promise<{ questionId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (!isStaff(session.user.role)) redirect("/");

  const { questionId } = await params;

  let thread;
  try {
    thread = await getStaffQuestionThread({ questionId });
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link
        href="/questions"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        학생 질문 목록
      </Link>
      <StaffQuestionPanel
        questionId={questionId}
        question={thread.question}
        messages={thread.messages}
      />
    </div>
  );
}
