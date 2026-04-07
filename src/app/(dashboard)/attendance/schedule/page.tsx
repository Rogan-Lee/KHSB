import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleEditor } from "@/components/attendance/schedule-editor";

export default async function AttendanceSchedulePage() {
  const user = await getUser();
  if (!user?.orgId) return null;
  const orgId = user.orgId;

  const students = await prisma.student.findMany({
    where: { orgId, status: "ACTIVE" },
    include: { schedules: true, outings: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>원생별 등원 일정 관리</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            각 원생의 등원 요일과 시간을 설정합니다. 설정된 일정 기준으로 결석 여부를 확인합니다.
          </p>
          <ScheduleEditor students={students} />
        </CardContent>
      </Card>
    </div>
  );
}
