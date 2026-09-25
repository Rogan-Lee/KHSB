import { redirect } from "next/navigation";
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
    <div className="pt-x2">
      <div className="mb-x8">
        <h1 className="t9-bold text-fg-neutral">어떤 문제가 궁금한가요?</h1>
        <p className="mt-x2 t5-regular text-fg-neutral-subtle">
          사진 한 장이면 충분해요. 멘토가 풀이를 차근차근 알려드릴게요.
        </p>
      </div>
      <QuestionForm token={token} />
    </div>
  );
}
