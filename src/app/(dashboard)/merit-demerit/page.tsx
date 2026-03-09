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
import { MeritForm } from "@/components/merit-demerit/merit-form";
import { Trophy, TrendingDown } from "lucide-react";

export default async function MeritDemeritPage() {
  const [students, recentMerits] = await Promise.all([
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        grade: true,
        merits: { select: { type: true, points: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.meritDemerit.findMany({
      include: { student: { select: { name: true, grade: true } } },
      orderBy: { date: "desc" },
      take: 50,
    }),
  ]);

  const studentSummaries = students
    .map((s) => ({
      id: s.id,
      name: s.name,
      grade: s.grade,
      merits: s.merits.filter((m) => m.type === "MERIT").reduce((a, m) => a + m.points, 0),
      demerits: s.merits.filter((m) => m.type === "DEMERIT").reduce((a, m) => a + m.points, 0),
    }))
    .sort((a, b) => b.merits - b.demerits - (a.merits - a.demerits));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Ranking */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <CardTitle className="text-base">순점수 랭킹</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {studentSummaries.slice(0, 10).map((s, i) => (
                <div key={s.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold w-6 ${i < 3 ? "text-yellow-600" : "text-muted-foreground"}`}>
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.grade}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-green-600">+{s.merits}</span>
                    <span className="text-red-600">-{s.demerits}</span>
                    <span className={`font-bold ${s.merits - s.demerits >= 0 ? "text-green-600" : "text-red-600"}`}>
                      ({s.merits - s.demerits})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Add form */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            <CardTitle className="text-base">상벌점 부여</CardTitle>
          </CardHeader>
          <CardContent>
            <MeritForm students={students} />
          </CardContent>
        </Card>
      </div>

      {/* Recent history */}
      <Card>
        <CardHeader>
          <CardTitle>최근 상벌점 내역</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>날짜</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>구분</TableHead>
                <TableHead>점수</TableHead>
                <TableHead>카테고리</TableHead>
                <TableHead>사유</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentMerits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    상벌점 내역이 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                recentMerits.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{formatDate(m.date)}</TableCell>
                    <TableCell>
                      <span className="font-medium">{m.student.name}</span>
                      <span className="text-xs text-muted-foreground ml-1">{m.student.grade}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.type === "MERIT" ? "default" : "destructive"}>
                        {m.type === "MERIT" ? "상점" : "벌점"}
                      </Badge>
                    </TableCell>
                    <TableCell className={`font-medium ${m.type === "MERIT" ? "text-green-600" : "text-red-600"}`}>
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
    </div>
  );
}
