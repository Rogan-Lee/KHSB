import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, UserCheck, UserX, GraduationCap } from "lucide-react";
import { formatDate } from "@/lib/utils";

const STATUS_MAP = {
  ACTIVE: { label: "재원", variant: "default" as const },
  INACTIVE: { label: "휴원", variant: "secondary" as const },
  GRADUATED: { label: "졸업", variant: "outline" as const },
};

export default async function StudentsPage() {
  const students = await prisma.student.findMany({
    include: { mentor: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  const active = students.filter((s) => s.status === "ACTIVE").length;
  const inactive = students.filter((s) => s.status === "INACTIVE").length;
  const graduated = students.filter((s) => s.status === "GRADUATED").length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <UserCheck className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold">{active}</p>
              <p className="text-sm text-muted-foreground">재원생</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <UserX className="h-8 w-8 text-orange-500" />
            <div>
              <p className="text-2xl font-bold">{inactive}</p>
              <p className="text-sm text-muted-foreground">휴원생</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <GraduationCap className="h-8 w-8 text-blue-600" />
            <div>
              <p className="text-2xl font-bold">{graduated}</p>
              <p className="text-sm text-muted-foreground">졸업생</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>원생 목록</CardTitle>
          <Link href="/students/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              원생 등록
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>학년</TableHead>
                <TableHead>좌석</TableHead>
                <TableHead>연락처</TableHead>
                <TableHead>학부모 연락처</TableHead>
                <TableHead>담당 멘토</TableHead>
                <TableHead>등원일</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    등록된 원생이 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                students.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <Link
                        href={`/students/${student.id}`}
                        className="font-medium hover:underline text-primary"
                      >
                        {student.name}
                      </Link>
                    </TableCell>
                    <TableCell>{student.grade}</TableCell>
                    <TableCell>{student.seat || "-"}</TableCell>
                    <TableCell>{student.phone || "-"}</TableCell>
                    <TableCell>{student.parentPhone}</TableCell>
                    <TableCell>{student.mentor?.name || "-"}</TableCell>
                    <TableCell>{formatDate(student.startDate)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_MAP[student.status].variant}>
                        {STATUS_MAP[student.status].label}
                      </Badge>
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
