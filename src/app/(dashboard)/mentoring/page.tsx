import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import { NewMentoringDialog } from "@/components/mentoring/new-mentoring-dialog";

const STATUS_MAP = {
  SCHEDULED: { label: "예정", variant: "secondary" as const },
  COMPLETED: { label: "완료", variant: "default" as const },
  CANCELLED: { label: "취소", variant: "destructive" as const },
  RESCHEDULED: { label: "일정변경", variant: "outline" as const },
};

export default async function MentoringPage() {
  const session = await auth();
  const isDirector = session?.user?.role === "DIRECTOR";

  const mentorings = await prisma.mentoring.findMany({
    where: isDirector ? undefined : { mentorId: session?.user?.id },
    include: {
      student: { select: { id: true, name: true, grade: true } },
      mentor: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: "desc" },
    take: 50,
  });

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, grade: true },
    orderBy: { name: "asc" },
  });

  const upcoming = mentorings.filter((m) => m.status === "SCHEDULED").length;
  const completed = mentorings.filter((m) => m.status === "COMPLETED").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">예정된 멘토링</p>
            <p className="text-2xl font-bold">{upcoming}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">완료된 멘토링</p>
            <p className="text-2xl font-bold">{completed}건</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>멘토링 목록</CardTitle>
          <NewMentoringDialog students={students} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>예정일</TableHead>
                <TableHead>원생</TableHead>
                {isDirector && <TableHead>멘토</TableHead>}
                <TableHead>상태</TableHead>
                <TableHead>메모</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mentorings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    멘토링 기록이 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                mentorings.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{formatDate(m.scheduledAt)}</TableCell>
                    <TableCell>
                      <span className="font-medium">{m.student.name}</span>
                      <span className="text-xs text-muted-foreground ml-1">{m.student.grade}</span>
                    </TableCell>
                    {isDirector && <TableCell>{m.mentor.name}</TableCell>}
                    <TableCell>
                      <Badge variant={STATUS_MAP[m.status].variant}>
                        {STATUS_MAP[m.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground line-clamp-1 max-w-48">
                      {m.notes || "-"}
                    </TableCell>
                    <TableCell>
                      <Link href={`/mentoring/${m.id}`}>
                        <Button variant="ghost" size="sm">기록 작성</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
