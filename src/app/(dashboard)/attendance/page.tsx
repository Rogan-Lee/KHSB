import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { CheckCircle2, XCircle, Clock, Minus, UserX, BookOpen } from "lucide-react";
import { todayKST } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { offlineStudentWhere } from "@/lib/student-filters";

export const revalidate = 30; // 30초 캐싱 (force-dynamic 대비 성능 향상)

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const isAbsentFilter = filter === "absent";
  const isSelfStudyFilter = filter === "self-study";

  const today = todayKST();
  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const dayOfWeek = kstNow.getUTCDay();
  const nowHHMM = kstNow.toISOString().slice(11, 16); // "HH:MM" KST

  const students = await prisma.student.findMany({
    where: offlineStudentWhere({ status: "ACTIVE" }),
    include: {
      attendances: { where: { date: today } },
      schedules: { where: { dayOfWeek } },
      outings: { where: { dayOfWeek } },
      dailyOutings: { where: { date: today }, orderBy: { outStart: "asc" as const } },
      communications: { orderBy: { createdAt: "desc" as const }, take: 30 },
      assignments: { orderBy: { createdAt: "desc" as const }, take: 20 },
      merits: { where: { date: today }, select: { type: true, points: true, date: true } },
      vocabEnrollment: { select: { isActive: true } },
      timetableEntries: {
        where: { dayOfWeek },
        select: { startTime: true, endTime: true, subject: true },
      },
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

  // 현재 시간 기준 입실 기록 없는 원생: 예정 입실 시각이 지났고 아직 체크인 안 된 원생
  const absentNowList = withSchedule.filter((s) => {
    const schedIn = s.schedules[0]?.startTime;
    if (!schedIn || schedIn === "FLEXIBLE") return false;
    if (s.attendances[0]?.checkIn) return false;
    return schedIn <= nowHHMM;
  });
  const absentNowCount = absentNowList.length;

  // 현재 시간 기준 자습 중인 원생: 이 시각에 학원/과외 등 외부 일정이 없는 원생.
  // 시간표 entry가 현재 시각을 덮지 않거나, 덮더라도 subject에 "자습" 포함이면 해당.
  const selfStudyNowList = students.filter((s) => {
    const currentEntry = s.timetableEntries.find(
      (e) => e.startTime <= nowHHMM && nowHHMM < e.endTime,
    );
    if (!currentEntry) return true;
    return currentEntry.subject.includes("자습");
  });
  const selfStudyNowCount = selfStudyNowList.length;

  const visibleStudents = isAbsentFilter
    ? absentNowList
    : isSelfStudyFilter
    ? selfStudyNowList
    : students;

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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7 sm:gap-3">
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
        <Link
          href={isAbsentFilter ? "/attendance" : "/attendance?filter=absent"}
          aria-pressed={isAbsentFilter}
          title={isAbsentFilter ? "전체 보기로 돌아가기" : "현재 시각 기준 아직 입실 안 한 원생만 보기"}
        >
          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-sm",
              isAbsentFilter
                ? "ring-2 ring-red-500 bg-red-50 hover:bg-red-100"
                : "hover:bg-accent/50"
            )}
          >
            <CardContent className="flex items-center gap-2 pt-4 pb-3">
              <UserX className={cn("h-6 w-6 shrink-0", isAbsentFilter ? "text-red-600" : "text-rose-500")} />
              <div>
                <p className="text-xl font-bold leading-none">{absentNowCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAbsentFilter ? "필터 해제" : "결석자 보기"}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link
          href={isSelfStudyFilter ? "/attendance" : "/attendance?filter=self-study"}
          aria-pressed={isSelfStudyFilter}
          title={isSelfStudyFilter ? "전체 보기로 돌아가기" : "현재 시각 기준 자습 중이어야 할 원생만 보기 (시간표 기준)"}
        >
          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-sm",
              isSelfStudyFilter
                ? "ring-2 ring-indigo-500 bg-indigo-50 hover:bg-indigo-100"
                : "hover:bg-accent/50"
            )}
          >
            <CardContent className="flex items-center gap-2 pt-4 pb-3">
              <BookOpen className={cn("h-6 w-6 shrink-0", isSelfStudyFilter ? "text-indigo-600" : "text-indigo-500")} />
              <div>
                <p className="text-xl font-bold leading-none">{selfStudyNowCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isSelfStudyFilter ? "필터 해제" : "자습 중 보기"}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <AttendanceTable students={visibleStudents} today={today.toISOString()} />
    </div>
  );
}
