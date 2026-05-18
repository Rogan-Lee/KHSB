export const revalidate = 30;

import { prisma } from "@/lib/prisma";
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
    <div className="space-y-4">
      <h1 className="text-xl font-bold">시간표</h1>
      <TimetablePageClient students={students} mentors={mentors} />
    </div>
  );
}
