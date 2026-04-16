import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { ReportGeneratorPanel } from "@/components/reports/report-generator-panel";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (session.user.role !== "DIRECTOR" && session.user.role !== "ADMIN") redirect("/");

  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const [students, reports] = await Promise.all([
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true },
      orderBy: { name: "asc" },
    }),
    prisma.monthlyReport.findMany({
      where: { year, month },
      include: {
        student: { select: { id: true, name: true, grade: true } },
      },
      orderBy: { student: { name: "asc" } },
    }),
  ]);

  const generated = reports.length;
  const sent = reports.filter((r) => r.sentAt).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <a
          href="/reports/monthly"
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          월간 학부모 리포트 →
        </a>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{year}년 {month}월 리포트</p>
            <p className="text-2xl font-bold">{generated} / {students.length}</p>
            <p className="text-xs text-muted-foreground mt-1">생성완료 / 전체</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">발송 완료</p>
            <p className="text-2xl font-bold">{sent}건</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>리포트 생성</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportGeneratorPanel students={students} year={year} month={month} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{year}년 {month}월 리포트 현황</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>원생</TableHead>
                  <TableHead>출석</TableHead>
                  <TableHead>결석</TableHead>
                  <TableHead>상점</TableHead>
                  <TableHead>발송</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      생성된 리포트가 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  reports.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <span className="font-medium">{r.student.name}</span>
                        <span className="text-xs text-muted-foreground ml-1">{r.student.grade}</span>
                      </TableCell>
                      <TableCell>{r.attendanceDays}일</TableCell>
                      <TableCell>{r.absentDays}일</TableCell>
                      <TableCell className="text-green-600">+{r.totalMerits}</TableCell>
                      <TableCell>
                        {r.sentAt ? (
                          <Badge variant="default" className="text-xs">발송완료</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">미발송</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
