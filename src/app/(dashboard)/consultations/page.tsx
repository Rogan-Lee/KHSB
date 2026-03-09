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
import { ConsultationDialog } from "@/components/consultations/consultation-dialog";

const STATUS_MAP = {
  SCHEDULED: { label: "예정", variant: "secondary" as const },
  COMPLETED: { label: "완료", variant: "default" as const },
  CANCELLED: { label: "취소", variant: "destructive" as const },
};

export default async function ConsultationsPage() {
  const [consultations, students] = await Promise.all([
    prisma.directorConsultation.findMany({
      include: { student: { select: { id: true, name: true, grade: true } } },
      orderBy: { scheduledAt: "desc" },
    }),
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const upcoming = consultations.filter((c) => c.status === "SCHEDULED").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">예정된 면담</p>
            <p className="text-2xl font-bold">{upcoming}건</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>원장 면담 기록</CardTitle>
          <ConsultationDialog students={students} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>예정일</TableHead>
                <TableHead>원생</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>주제</TableHead>
                <TableHead>결과</TableHead>
                <TableHead>사후조치</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consultations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    면담 기록이 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                consultations.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.scheduledAt ? formatDate(c.scheduledAt) : "-"}</TableCell>
                    <TableCell>
                      <span className="font-medium">{c.student.name}</span>
                      <span className="text-xs text-muted-foreground ml-1">{c.student.grade}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_MAP[c.status].variant}>
                        {STATUS_MAP[c.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-32 line-clamp-1">{c.agenda || "-"}</TableCell>
                    <TableCell className="text-sm max-w-32 line-clamp-1">{c.outcome || "-"}</TableCell>
                    <TableCell className="text-sm max-w-32 line-clamp-1">{c.followUp || "-"}</TableCell>
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
