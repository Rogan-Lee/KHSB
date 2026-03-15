import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { CheckCircle2, XCircle, Clock, LogOut, Minus } from "lucide-react";

export default async function AttendancePage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    include: {
      attendances: { where: { date: today } },
      schedules: { where: { dayOfWeek: today.getDay() } },
      outings: { where: { dayOfWeek: today.getDay() } },
      dailyOutings: { where: { date: today }, orderBy: { outStart: "asc" as const } },
      communications: { orderBy: { createdAt: "desc" as const } },
      assignments: { orderBy: { createdAt: "desc" as const } },
    },
    orderBy: { seat: "asc" },
  });

  const withSchedule = students.filter((s) => s.schedules.length > 0);
  const normal = withSchedule.filter((s) => s.attendances[0]?.type === "NORMAL").length;
  const absent = withSchedule.filter(
    (s) => s.attendances[0]?.type === "ABSENT" || (!s.attendances[0])
  ).length;
  const tardy = withSchedule.filter((s) => s.attendances[0]?.type === "TARDY").length;
  const earlyLeave = withSchedule.filter((s) => s.attendances[0]?.type === "EARLY_LEAVE").length;
  const noSchedule = students.filter((s) => s.schedules.length === 0).length;

  const dateLabel = today.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{dateLabel} 출결 현황</h2>
        <span className="text-sm text-muted-foreground">등원 예정 {withSchedule.length}명</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
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
            <LogOut className="h-6 w-6 text-blue-600 shrink-0" />
            <div>
              <p className="text-xl font-bold leading-none">{earlyLeave}</p>
              <p className="text-xs text-muted-foreground mt-0.5">조퇴</p>
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
