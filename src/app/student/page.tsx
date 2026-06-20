import { redirect } from "next/navigation";

import { getStudent } from "@/lib/auth";

export default async function StudentAccountPage() {
  const student = await getStudent();
  if (!student) redirect("/sign-in");

  return (
    <main className="min-h-screen bg-canvas px-4 py-12">
      <section className="mx-auto max-w-lg rounded-[8px] border border-line bg-panel p-6">
        <p className="text-sm font-semibold text-brand-2">학생 계정</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">{student.name}님</h1>
        <p className="mt-3 text-sm leading-6 text-ink-3">
          과제, 피드백, 멘토링, 질의응답 기능은 스터디룸 매니저 모바일 앱에서
          이용할 수 있습니다.
        </p>
      </section>
    </main>
  );
}
