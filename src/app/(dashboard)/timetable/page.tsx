export const revalidate = 30;

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/backoffice/ui";
import { TimetablePageClient } from "./timetable-client";

export default async function TimetablePage() {
  const [students, mentors] = await Promise.all([
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true, school: true, mentorId: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      // 시간표 멘토 picker — 퇴사자 제외
      where: { status: "ACTIVE", isMentor: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader title="시간표" description="원생별 주간 시간표와 하루 학습 계획을 관리해요." />
      <TimetablePageClient students={students} mentors={mentors} />
    </>
  );
}
