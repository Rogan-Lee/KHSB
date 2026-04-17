export const revalidate = 30;

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, UserCheck, UserX, GraduationCap, LogOut } from "lucide-react";
import { StudentsScheduleTable } from "@/components/students/students-schedule-table";
import { StudentsTable } from "@/components/students/students-table";
import { CsvImport } from "@/components/students/csv-import";
import { CsvImportScores } from "@/components/students/csv-import-scores";
import { SheetsImport } from "@/components/students/sheets-import";
import { getGoogleSheetsConfig } from "@/actions/google-sheets";
import { isGoogleCalendarConfigured, getGoogleAuthUrl, isOAuthAppConfigured } from "@/lib/google-calendar";

export default async function StudentsPage() {
  const [students, studentsSheetConfig, scoresSheetConfig, googleConnected] = await Promise.all([
    prisma.student.findMany({
      include: {
        mentor: { select: { name: true } },
        schedules: true,
        outings: true,
      },
      orderBy: [{ seat: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    }),
    getGoogleSheetsConfig("students"),
    getGoogleSheetsConfig("scores"),
    isGoogleCalendarConfigured(),
  ]);

  const googleAuthUrl = isOAuthAppConfigured() ? getGoogleAuthUrl() : "";

  const active = students.filter((s) => s.status === "ACTIVE").length;
  const inactive = students.filter((s) => s.status === "INACTIVE").length;
  const withdrawn = students.filter((s) => s.status === "WITHDRAWN").length;
  const graduated = students.filter((s) => s.status === "GRADUATED").length;
  const activeStudents = students.filter((s) => s.status === "ACTIVE");

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 md:gap-4">
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
            <LogOut className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{withdrawn}</p>
              <p className="text-sm text-muted-foreground">퇴원생</p>
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
            <TabsTrigger value="import">원생 CSV 가져오기</TabsTrigger>
            <TabsTrigger value="scores-import">성적 CSV 업로드</TabsTrigger>
            <TabsTrigger value="sheets">구글 시트 연동</TabsTrigger>
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

        <TabsContent value="scores-import" className="mt-3">
          <Card>
            <CardContent className="pt-5">
              <CsvImportScores />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sheets" className="mt-3">
          <Card>
            <CardContent className="pt-5">
              <SheetsImport
                studentsConfig={studentsSheetConfig ? { sheetUrl: studentsSheetConfig.sheetUrl, sheetName: studentsSheetConfig.sheetName } : null}
                scoresConfig={scoresSheetConfig ? { sheetUrl: scoresSheetConfig.sheetUrl, sheetName: scoresSheetConfig.sheetName } : null}
                googleAuthUrl={googleAuthUrl}
                isGoogleConnected={googleConnected}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
