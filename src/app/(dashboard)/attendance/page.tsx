import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { CheckCircle2, XCircle, Clock, LogOut, Minus } from "lucide-react";
import { todayKST } from "@/lib/utils";

export const revalidate = 30; // 30초 캐싱 (force-dynamic 대비 성능 향상)

export default async function AttendancePage() {
  const today = todayKST();
  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const dayOfWeek = kstNow.getUTCDay();

  // 이번 달 1일 (상벌점 범위 제한용)
  const monthStart = new Date(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1);

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    include: {
      attendances: { where: { date: today } },
      schedules: { where: { dayOfWeek } },
      outings: { where: { dayOfWeek } },
      dailyOutings: { where: { date: today }, orderBy: { outStart: "asc" as const } },
      communications: { orderBy: { createdAt: "desc" as const }, take: 30 },
      assignments: { orderBy: { createdAt: "desc" as const }, take: 20 },
      merits: { where: { date: { gte: monthStart } }, select: { type: true, points: true, date: true } },
      vocabEnrollment: { select: { isActive: true } },
    },
    orderBy: { seat: "asc" },
  });

  const withSchedule = students.filter((s) => s.schedules.length > 0);
  const normal = withSchedule.filter((s) => s.attendances[0]?.type === "NORMAL").length;
  const absent = withSchedule.filter(
    (s) => s.attendances[0]?.type === "ABSENT" || (!s.attendances[0])
  ).length;
  const notifiedAbsent = withSchedule.filter((s) => s.attendances[0]?.type === "NOTIFIED_ABSENT").length;
  const tardy = withSchedule.filter((s) => s.attendances[0]?.type === "TARDY").length;
  const noSchedule = students.filter((s) => s.schedules.length === 0).length;

  const dateLabel = today.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{dateLabel} 출결 현황</h2>
        <span className="text-sm text-muted-foreground">등원 예정 {withSchedule.length}명</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
        <Card>
          <CardContent className="flex items-center gap-2 pt-4 pb-3">
            <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
            <div>
              <p className="text-xl font-bold leading-none">{normal}</p>
              <p className="text-xs text-muted-foreground mt-0.5">정상</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2 pt-4 pb-3">
            <XCircle className="h-6 w-6 text-red-600 shrink-0" />
            <div>
              <p className="text-xl font-bold leading-none">{absent}</p>
              <p className="text-xs text-muted-foreground mt-0.5">결석</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2 pt-4 pb-3">
            <Clock className="h-6 w-6 text-orange-500 shrink-0" />
            <div>
              <p className="text-xl font-bold leading-none">{tardy}</p>
              <p className="text-xs text-muted-foreground mt-0.5">지각</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2 pt-4 pb-3">
            <Minus className="h-6 w-6 text-purple-500 shrink-0" />
            <div>
              <p className="text-xl font-bold leading-none">{notifiedAbsent}</p>
              <p className="text-xs text-muted-foreground mt-0.5">미입실</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2 pt-4 pb-3">
            <Minus className="h-6 w-6 text-gray-400 shrink-0" />
            <div>
              <p className="text-xl font-bold leading-none">{noSchedule}</p>
              <p className="text-xs text-muted-foreground mt-0.5">비등원일</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <AttendanceTable students={students} today={today.toISOString()} />
    </div>
  );
}
