import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, UserCheck, UserX, GraduationCap } from "lucide-react";
import { StudentsScheduleTable } from "@/components/students/students-schedule-table";
import { StudentsTable } from "@/components/students/students-table";
import { CsvImport } from "@/components/students/csv-import";

export default async function StudentsPage() {
  const students = await prisma.student.findMany({
    include: {
      mentor: { select: { name: true } },
      schedules: true,
    },
    orderBy: [{ seat: { sort: "asc", nulls: "last" } }, { name: "asc" }],
  });

  const active = students.filter((s) => s.status === "ACTIVE").length;
  const inactive = students.filter((s) => s.status === "INACTIVE").length;
  const graduated = students.filter((s) => s.status === "GRADUATED").length;
  const activeStudents = students.filter((s) => s.status === "ACTIVE");

  return (
    <div className="space-y-4">
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

      <Tabs defaultValue="list">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="list">원생 목록</TabsTrigger>
            <TabsTrigger value="schedule">입퇴실 일정</TabsTrigger>
            <TabsTrigger value="import">CSV 가져오기</TabsTrigger>
          </TabsList>
          <Link href="/students/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              원생 등록
            </Button>
          </Link>
        </div>

        <TabsContent value="list" className="mt-3">
          <Card>
            <CardContent className="pt-4">
              <StudentsTable students={students} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="mt-3">
          <StudentsScheduleTable students={activeStudents} />
        </TabsContent>

        <TabsContent value="import" className="mt-3">
          <Card>
            <CardContent className="pt-5">
              <CsvImport />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
