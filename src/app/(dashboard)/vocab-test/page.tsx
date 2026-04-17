export const revalidate = 30;

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { VocabTestBoard } from "@/components/vocab-test/vocab-test-board";

export default async function VocabTestPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const [students, enrollments, scores] = await Promise.all([
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true, name: true, grade: true, school: true,
        vocabEnrollment: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.vocabTestEnrollment.findMany({
      where: { isActive: true },
      include: { student: { select: { id: true, name: true, grade: true, school: true } } },
    }),
    prisma.vocabTestScore.findMany({
      include: { student: { select: { id: true, name: true, grade: true } } },
      orderBy: { testDate: "desc" },
      take: 200,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">영단어 시험 관리</h1>
        <p className="text-sm text-muted-foreground mt-1">
          대상자 등록, 성적 입력 및 이력을 관리합니다.
        </p>
      </div>
      <VocabTestBoard students={students} enrollments={enrollments} scores={scores} />
    </div>
  );
}
