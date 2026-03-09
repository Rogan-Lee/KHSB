import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AttendanceBoard } from "@/components/attendance/attendance-board";
import { CheckCircle2, XCircle, Clock, LogOut } from "lucide-react";

export default async function AttendancePage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    include: {
      attendances: { where: { date: today } },
      schedules: { where: { dayOfWeek: today.getDay() } },
    },
    orderBy: { name: "asc" },
  });

  const normal = students.filter((s) => s.attendances[0]?.type === "NORMAL").length;
  const absent = students.filter(
    (s) => s.attendances[0]?.type === "ABSENT" || (!s.attendances[0] && s.schedules.length > 0)
  ).length;
  const tardy = students.filter((s) => s.attendances[0]?.type === "TARDY").length;
  const earlyLeave = students.filter((s) => s.attendances[0]?.type === "EARLY_LEAVE").length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold">{normal}</p>
              <p className="text-sm text-muted-foreground">정상 출석</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <XCircle className="h-8 w-8 text-red-600" />
            <div>
              <p className="text-2xl font-bold">{absent}</p>
              <p className="text-sm text-muted-foreground">결석</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <Clock className="h-8 w-8 text-orange-500" />
            <div>
              <p className="text-2xl font-bold">{tardy}</p>
              <p className="text-sm text-muted-foreground">지각</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <LogOut className="h-8 w-8 text-blue-600" />
            <div>
              <p className="text-2xl font-bold">{earlyLeave}</p>
              <p className="text-sm text-muted-foreground">조퇴</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Board */}
      <AttendanceBoard students={students} today={today.toISOString()} />
    </div>
  );
}
