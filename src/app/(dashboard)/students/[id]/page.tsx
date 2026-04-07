import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatTime, parseSchool } from "@/lib/utils";
import { StudentForm } from "@/components/students/student-form";
import { StudentScheduleEditor } from "@/components/students/student-schedule-editor";
import { CommunicationPanel } from "@/components/communications/communication-panel";
import { ExamScoreChart } from "@/components/students/exam-score-chart";
import { AssignmentPanel } from "@/components/assignments/assignment-panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_MAP = {
  ACTIVE: { label: "재원", variant: "default" as const },
  INACTIVE: { label: "휴원", variant: "secondary" as const },
  GRADUATED: { label: "졸업", variant: "outline" as const },
  WITHDRAWN: { label: "퇴원", variant: "destructive" as const },
};

const ATTENDANCE_TYPE_MAP: Record<string, { label: string; variant: "default" | "destructive" | "secondary" | "outline" }> = {
  NORMAL: { label: "정상", variant: "default" },
  ABSENT: { label: "결석", variant: "destructive" },
  TARDY: { label: "지각", variant: "secondary" },
  EARLY_LEAVE: { label: "정상", variant: "default" },
  APPROVED_ABSENT: { label: "공결", variant: "secondary" },
  NOTIFIED_ABSENT: { label: "미입실", variant: "secondary" },
};

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user?.orgId) return null;
  const orgId = user.orgId;

  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  let student;
  try {
    student = await prisma.student.findFirst({
      where: { id, orgId },
      include: {
        mentor: { select: { id: true, name: true } },
        schedules: { orderBy: { dayOfWeek: "asc" } },
        outings: { orderBy: { dayOfWeek: "asc" } },
        attendances: { orderBy: { date: "desc" }, take: 30 },
        merits: { orderBy: { date: "desc" }, take: 20 },
        mentorings: {
          orderBy: { scheduledAt: "desc" },
          take: 10,
          include: { mentor: { select: { name: true } } },
        },
        consultations: { orderBy: { scheduledAt: "desc" }, take: 10 },
        communications: { orderBy: { createdAt: "desc" } },
        examScores: { orderBy: { examDate: "desc" } },
        assignments: { orderBy: { createdAt: "desc" } },
      },
    });
  } catch (e) {
    console.error("[StudentDetail] Prisma error:", e);
    throw e;
  }

  if (!student) notFound();

  const [mentors, schoolRows, seatRows] = await Promise.all([
    prisma.user.findMany({
      where: { memberships: { some: { orgId } }, role: { in: ["ADMIN", "DIRECTOR", "MENTOR"] } },
      select: { id: true, name: true },
    }),
    prisma.student.findMany({ where: { orgId }, select: { school: true } }),
    prisma.student.findMany({
      where: { orgId, status: "ACTIVE", seat: { not: null }, id: { not: student.id } },
      select: { seat: true },
    }),
  ]);

  const schools = [...new Set(schoolRows.map((s) => parseSchool(s.school ?? "")).filter(Boolean))].sort();
  const occupiedSeats = seatRows.map((s) => s.seat!);

  const totalMerits = student.merits
    .filter((m) => m.type === "MERIT")
    .reduce((acc, m) => acc + m.points, 0);
  const totalDemerits = student.merits
    .filter((m) => m.type === "DEMERIT")
    .reduce((acc, m) => acc + m.points, 0);

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold">{student.name}</h2>
        <Badge variant={STATUS_MAP[student.status].variant}>
          {STATUS_MAP[student.status].label}
        </Badge>
        <span className="text-muted-foreground">{student.grade}</span>
        {student.seat && (
          <span className="text-sm bg-muted px-2 py-0.5 rounded">
            좌석 {student.seat}
          </span>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">이번 달 출석</p>
            <p className="text-2xl font-bold">
              {student.attendances.filter((a) => a.type === "NORMAL").length}일
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">누적 상점</p>
            <p className="text-2xl font-bold text-green-600">{totalMerits}점</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">누적 벌점</p>
            <p className="text-2xl font-bold text-red-600">{totalDemerits}점</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">순점수</p>
            <p className={`text-2xl font-bold ${totalMerits - totalDemerits >= 0 ? "text-green-600" : "text-red-600"}`}>
              {totalMerits - totalDemerits}점
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">기본 정보</TabsTrigger>
          <TabsTrigger value="schedule">입퇴실 일정</TabsTrigger>
          <TabsTrigger value="attendance">출결 기록</TabsTrigger>
          <TabsTrigger value="merits">상벌점</TabsTrigger>
          <TabsTrigger value="mentoring">멘토링</TabsTrigger>
          <TabsTrigger value="consultation">면담</TabsTrigger>
          <TabsTrigger value="assignments">
            과제
            {student.assignments.filter((a) => !a.isCompleted).length > 0 && (
              <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {student.assignments.filter((a) => !a.isCompleted).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="communications">
            요청/전달
            {student.communications.filter((c) => !c.isChecked).length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {student.communications.filter((c) => !c.isChecked).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="scores">성적</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>기본 정보 수정</CardTitle>
            </CardHeader>
            <CardContent>
              <StudentForm student={student} mentors={mentors} schools={schools} occupiedSeats={occupiedSeats} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>입퇴실 약속 일정</CardTitle>
            </CardHeader>
            <CardContent>
              <StudentScheduleEditor studentId={student.id} schedules={student.schedules} outings={student.outings} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>최근 출결 기록 (30일)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>입실</TableHead>
                    <TableHead>퇴실</TableHead>
                    <TableHead>비고</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {student.attendances.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        출결 기록이 없습니다
                      </TableCell>
                    </TableRow>
                  ) : (
                    student.attendances.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{formatDate(a.date)}</TableCell>
                        <TableCell>
                          <Badge variant={ATTENDANCE_TYPE_MAP[a.type].variant}>
                            {ATTENDANCE_TYPE_MAP[a.type].label}
                          </Badge>
                        </TableCell>
                        <TableCell>{a.checkIn ? formatTime(a.checkIn) : "-"}</TableCell>
                        <TableCell>{a.checkOut ? formatTime(a.checkOut) : "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{a.notes || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="merits" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>상벌점 내역</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>구분</TableHead>
                    <TableHead>점수</TableHead>
                    <TableHead>카테고리</TableHead>
                    <TableHead>사유</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {student.merits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        상벌점 내역이 없습니다
                      </TableCell>
                    </TableRow>
                  ) : (
                    student.merits.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{formatDate(m.date)}</TableCell>
                        <TableCell>
                          <Badge variant={m.type === "MERIT" ? "default" : "destructive"}>
                            {m.type === "MERIT" ? "상점" : "벌점"}
                          </Badge>
                        </TableCell>
                        <TableCell className={m.type === "MERIT" ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                          {m.type === "MERIT" ? "+" : "-"}{m.points}
                        </TableCell>
                        <TableCell>{m.category || "-"}</TableCell>
                        <TableCell>{m.reason}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mentoring" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>멘토링 기록</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>예정일</TableHead>
                    <TableHead>멘토</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>피드백</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {student.mentorings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                        멘토링 기록이 없습니다
                      </TableCell>
                    </TableRow>
                  ) : (
                    student.mentorings.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{formatDate(m.scheduledAt)}</TableCell>
                        <TableCell>{m.mentor.name}</TableCell>
                        <TableCell>
                          <Badge variant={m.status === "COMPLETED" ? "default" : "secondary"}>
                            {m.status === "SCHEDULED" ? "예정" :
                             m.status === "COMPLETED" ? "완료" :
                             m.status === "CANCELLED" ? "취소" : "일정변경"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground line-clamp-1">
                          {m.notes || "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="consultation" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>원장 면담 기록</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>예정일</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>주제</TableHead>
                    <TableHead>결과</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {student.consultations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        면담 기록이 없습니다
                      </TableCell>
                    </TableRow>
                  ) : (
                    student.consultations.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.scheduledAt ? formatDate(c.scheduledAt) : "-"}</TableCell>
                        <TableCell>
                          <Badge variant={c.status === "COMPLETED" ? "default" : "secondary"}>
                            {c.status === "SCHEDULED" ? "예정" :
                             c.status === "COMPLETED" ? "완료" : "취소"}
                          </Badge>
                        </TableCell>
                        <TableCell>{c.agenda || "-"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.outcome || "-"}</TableCell>
                        <TableCell>
                          <Link
                            href={`/consultations/${c.id}`}
                            className="text-sm text-primary hover:underline"
                          >
                            수정
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>과제 관리</CardTitle>
            </CardHeader>
            <CardContent>
              <AssignmentPanel
                studentId={student.id}
                studentName={student.name}
                initialItems={student.assignments}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>학부모 요청 / 운영진 전달사항</CardTitle>
            </CardHeader>
            <CardContent>
              <CommunicationPanel
                studentId={student.id}
                initialItems={student.communications}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scores" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>성적 관리</CardTitle>
            </CardHeader>
            <CardContent>
              <ExamScoreChart
                studentId={student.id}
                initialScores={student.examScores}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
