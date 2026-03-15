import { prisma } from "@/lib/prisma";
import { parseSchool } from "@/lib/utils";
import { CalendarView } from "@/components/calendar/calendar-view";

export default async function CalendarPage() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 3, 0);

  const events = await prisma.calendarEvent.findMany({
    where: {
      startDate: { gte: startOfMonth, lte: endOfMonth },
    },
    include: {
      student: { select: { id: true, name: true } },
    },
    orderBy: { startDate: "asc" },
  });

  // 등록된 학교 목록
  const schools = await prisma.student.findMany({
    where: { school: { not: null } },
    select: { school: true },
    distinct: ["school"],
  });
  // "반송고2", "반송고3" → "반송고"로 파싱 후 중복 제거
  const schoolNames = [...new Set(schools.map((s) => parseSchool(s.school!)).filter(Boolean))];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">캘린더</h1>
      <CalendarView initialEvents={events} schools={schoolNames} />
    </div>
  );
}
