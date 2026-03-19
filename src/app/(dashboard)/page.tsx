import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatTime } from "@/lib/utils";
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Star,
  MessageSquare,
  CalendarDays,
} from "lucide-react";
import Link from "next/link";
import { getRecentHandovers, getStaffList } from "@/actions/handover";
import { getChecklistTemplates } from "@/actions/checklist-templates";
import { getMonthlyNotes } from "@/actions/monthly-notes";
import { getTodos } from "@/actions/todos";
import { DashboardWrapper } from "@/components/dashboard/dashboard-wrapper";

export default async function DashboardPage() {
  const session = await auth();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [
    totalActive,
    todayAttendances,
    upcomingMentorings,
    recentMerits,
    upcomingConsultations,
    recentHandovers,
    templates,
    monthlyNotes,
    students,
    staffList,
    todos,
  ] = await Promise.all([
    prisma.student.count({ where: { status: "ACTIVE" } }),
    prisma.attendanceRecord.findMany({
      where: { date: today },
      include: { student: { select: { name: true, seat: true } } },
    }),
    prisma.mentoring.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: { gte: now },
        ...(session?.user?.role === "MENTOR" ? { mentorId: session.user.id } : {}),
      },
      include: {
        student: { select: { name: true, grade: true } },
        mentor: { select: { name: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    prisma.meritDemerit.findMany({
      include: { student: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.directorConsultation.findMany({
      where: { status: "SCHEDULED" },
      include: { student: { select: { name: true, grade: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    getRecentHandovers(7),
    getChecklistTemplates(),
    getMonthlyNotes(year, month),
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true },
      orderBy: { name: "asc" },
    }),
    getStaffList(),
    getTodos(),
  ]);

  const normalCount = todayAttendances.filter((a) => a.type === "NORMAL").length;
  const absentCount = todayAttendances.filter((a) => a.type === "ABSENT").length;
  const tardyCount = todayAttendances.filter((a) => a.type === "TARDY").length;

  const unreadCount = recentHandovers.filter(
    (h) => h.authorId !== session?.user?.id && !h.reads.some((r) => r.userId === session?.user?.id)
  ).length;

  // Normal dashboard content
  const dashboardContent = (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link href="/students">
          <Card className="hover:shadow-md transition-all duration-200 cursor-pointer hover:-translate-y-0.5">
            <CardContent className="flex items-center gap-3 pt-5 pb-5">
              <div className="p-2 rounded-xl bg-[#eaf2fe]">
                <Users className="h-5 w-5 text-[#0066ff]" />
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight">{totalActive}</p>
                <p className="text-xs text-muted-foreground">재원생</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/attendance">
          <Card className="hover:shadow-md transition-all duration-200 cursor-pointer hover:-translate-y-0.5">
            <CardContent className="flex items-center gap-3 pt-5 pb-5">
              <div className="p-2 rounded-xl bg-[#d9f7eb]">
                <CheckCircle2 className="h-5 w-5 text-[#00985a]" />
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight">{normalCount}</p>
                <p className="text-xs text-muted-foreground">오늘 출석</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/attendance">
          <Card className="hover:shadow-md transition-all duration-200 cursor-pointer hover:-translate-y-0.5">
            <CardContent className="flex items-center gap-3 pt-5 pb-5">
              <div className="p-2 rounded-xl bg-red-50">
                <XCircle className="h-5 w-5 text-[#ff4242]" />
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight">{absentCount}</p>
                <p className="text-xs text-muted-foreground">오늘 결석</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/attendance">
          <Card className="hover:shadow-md transition-all duration-200 cursor-pointer hover:-translate-y-0.5">
            <CardContent className="flex items-center gap-3 pt-5 pb-5">
              <div className="p-2 rounded-xl bg-[#fed9c4]">
                <Clock className="h-5 w-5 text-[#ff5e00]" />
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight">{tardyCount}</p>
                <p className="text-xs text-muted-foreground">오늘 지각</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Detail panels */}
      <div className="grid grid-cols-2 gap-6">
        {/* Upcoming mentorings */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">예정된 멘토링</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingMentorings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">예정된 멘토링이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {upcomingMentorings.map((m) => (
                  <Link key={m.id} href={`/mentoring/${m.id}`}>
                    <div className="flex items-center justify-between py-2 border-b last:border-0 hover:bg-accent -mx-1 px-1 rounded">
                      <div>
                        <span className="text-sm font-medium">{m.student.name}</span>
                        <span className="text-xs text-muted-foreground ml-1">{m.student.grade}</span>
                        {(session?.user?.role === "DIRECTOR" || session?.user?.role === "ADMIN") && (
                          <span className="text-xs text-muted-foreground ml-1">· {m.mentor.name}</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDate(m.scheduledAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming consultations */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">예정된 원장 면담</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingConsultations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">예정된 면담이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {upcomingConsultations.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <span className="text-sm font-medium">{c.student.name}</span>
                      <span className="text-xs text-muted-foreground ml-1">{c.student.grade}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {c.scheduledAt ? formatDate(c.scheduledAt) : "-"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent merit/demerit */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Star className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">최근 상벌점</CardTitle>
          </CardHeader>
          <CardContent>
            {recentMerits.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">최근 상벌점 내역이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {recentMerits.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={m.type === "MERIT" ? "default" : "destructive"} className="text-xs">
                        {m.type === "MERIT" ? "상점" : "벌점"}
                      </Badge>
                      <span className="text-sm font-medium">{m.student.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${m.type === "MERIT" ? "text-[#00985a]" : "text-[#ff4242]"}`}>
                        {m.type === "MERIT" ? "+" : "-"}{m.points}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDate(m.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's check-ins */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">오늘 입실 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {todayAttendances.filter((a) => a.checkIn).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">오늘 입실 기록이 없습니다</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {todayAttendances
                  .filter((a) => a.checkIn)
                  .sort((a, b) => new Date(a.checkIn!).getTime() - new Date(b.checkIn!).getTime())
                  .map((a) => (
                    <div key={a.id} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
                      <span className="font-medium">{a.student.name}</span>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {a.student.seat && (
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{a.student.seat}</span>
                        )}
                        <span>{formatTime(a.checkIn!)}</span>
                        {a.checkOut && <span>→ {formatTime(a.checkOut)}</span>}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <DashboardWrapper
      handovers={recentHandovers as Parameters<typeof DashboardWrapper>[0]["handovers"]}
      templates={templates}
      monthlyNotes={monthlyNotes as Parameters<typeof DashboardWrapper>[0]["monthlyNotes"]}
      students={students}
      staffList={staffList}
      currentUserId={session?.user?.id ?? ""}
      currentUserName={session?.user?.name ?? ""}
      userName={session?.user?.name ?? ""}
      year={year}
      month={month}
      unreadCount={unreadCount}
      todos={todos as Parameters<typeof DashboardWrapper>[0]["todos"]}
    >
      {dashboardContent}
    </DashboardWrapper>
  );
}
