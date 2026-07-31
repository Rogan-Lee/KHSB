import { redirect } from "next/navigation";
import { loadExamApplicationData } from "@/lib/exam-application-data";
import { ExamApplicationForm } from "@/components/exams/exam-application-form";

export const dynamic = "force-dynamic";

export default async function StudentExamPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadExamApplicationData(token);
  if (!data) redirect("/s/expired");

  return <ExamApplicationForm token={token} sessions={data.sessions} />;
}
