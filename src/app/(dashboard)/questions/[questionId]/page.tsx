import { notFound, redirect } from "next/navigation";
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

  // 상단 "학생 질문 목록" 뒤로가기 링크는 패널의 PageHeader(back)로 옮겼다.
  return (
    <StaffQuestionPanel
      questionId={questionId}
      question={thread.question}
      messages={thread.messages}
    />
  );
}
