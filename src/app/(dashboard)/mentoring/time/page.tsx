import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewMentoringTime } from "@/lib/roles";
import { Card, CardContent } from "@/components/ui/card";
import { PageIntro } from "@/components/ui/page-intro";
import { DateRangeToolbar } from "@/components/ui/date-range-toolbar";
import { MentoringTimeDashboard } from "@/components/mentoring/mentoring-time-dashboard";

export const revalidate = 10;

function parseDate(s: string | undefined, fallback: Date) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? fallback : dt;
}

export default async function MentoringTimePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!canViewMentoringTime(session?.user?.role)) redirect("/mentoring");

  const now = new Date();
  const { from: fromParam, to: toParam } = await searchParams;
  const hasRange = Boolean(fromParam || toParam);
  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const rangeFrom = hasRange ? parseDate(fromParam, new Date(2000, 0, 1)) : null;
  const rangeToInput = hasRange ? parseDate(toParam, now) : null;
  const rangeTo = rangeToInput
    ? new Date(rangeToInput.getFullYear(), rangeToInput.getMonth(), rangeToInput.getDate(), 23, 59, 59)
    : null;

  const mentorings = await prisma.mentoring.findMany({
    where: {
      status: { not: "CANCELLED" },
      ...(hasRange ? { scheduledAt: { gte: rangeFrom!, lte: rangeTo! } } : {}),
    },
    select: {
      id: true,
      scheduledAt: true,
      actualDate: true,
      actualStartTime: true,
      actualEndTime: true,
      status: true,
      student: { select: { name: true } },
      mentor: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: "desc" },
  });

  const rows = mentorings.map((m) => ({
    id: m.id,
    studentName: m.student.name,
    mentorId: m.mentor.id,
    mentorName: m.mentor.name,
    date: (m.actualDate ?? m.scheduledAt).toISOString(),
    start: m.actualStartTime,
    end: m.actualEndTime,
    status: m.status,
  }));

  return (
    <div className="space-y-6">
      <PageIntro
        tag="MENTORING · TIME"
        title="멘토링 시간 관리"
        description="멘토별 멘토링 진행 시간을 모아보고 짧게 끝난 세션을 확인합니다 (15분 미만 경고)"
        accent="text-info"
      />

      <Card>
        <CardContent className="pt-4 space-y-4">
          <DateRangeToolbar
            initialFrom={rangeFrom ? toIso(rangeFrom) : ""}
            initialTo={rangeToInput ? toIso(rangeToInput) : ""}
            basePath="/mentoring/time"
          />
          <MentoringTimeDashboard rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
