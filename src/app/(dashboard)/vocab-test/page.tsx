export const revalidate = 30;

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { VocabTestBoard } from "@/components/vocab-test/vocab-test-board";
import { offlineStudentWhere } from "@/lib/student-filters";

export default async function VocabTestPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const [studentsRaw, enrollments, scores] = await Promise.all([
    prisma.student.findMany({
      where: offlineStudentWhere({ status: "ACTIVE" }),
      select: {
        id: true, name: true, grade: true, school: true, seat: true,
        vocabEnrollment: true,
      },
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

  // 기본 정렬: 좌석번호 오름차순 (숫자 자리 우선, 비숫자는 뒤로, 동일 시 이름)
  const students = [...studentsRaw].sort((a, b) => {
    const na = a.seat && /^\d+$/.test(a.seat) ? parseInt(a.seat, 10) : Number.MAX_SAFE_INTEGER;
    const nb = b.seat && /^\d+$/.test(b.seat) ? parseInt(b.seat, 10) : Number.MAX_SAFE_INTEGER;
    if (na !== nb) return na - nb;
    return a.name.localeCompare(b.name, "ko");
  });

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
