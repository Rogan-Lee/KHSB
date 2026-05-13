export const revalidate = 30;

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { StudentsScheduleTable } from "@/components/students/students-schedule-table";
import { StudentsListView } from "@/components/students/students-list-view";
import { CsvImport } from "@/components/students/csv-import";
import { CsvImportScores } from "@/components/students/csv-import-scores";
import { SheetsImport } from "@/components/students/sheets-import";
import { getGoogleSheetsConfig } from "@/actions/google-sheets";
import { isGoogleCalendarConfigured, getGoogleAuthUrl, isOAuthAppConfigured } from "@/lib/google-calendar";
import { offlineStudentWhere } from "@/lib/student-filters";
import { listStudentPortalLinks } from "@/actions/student-portal-links";
import { auth } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { PortalLinksPanel } from "@/components/students/portal-links-panel";

const VALID_TABS = ["list", "schedule", "import", "scores-import", "sheets", "portal-links"] as const;
type TabValue = (typeof VALID_TABS)[number];

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const defaultTab: TabValue = (VALID_TABS as readonly string[]).includes(tab ?? "")
    ? (tab as TabValue)
    : "list";

  const [students, studentsSheetConfig, scoresSheetConfig, googleConnected, portalLinkRows, session] = await Promise.all([
    prisma.student.findMany({
      where: offlineStudentWhere(),
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
    listStudentPortalLinks(),
    auth(),
  ]);
  const canManagePortalLinks = isFullAccess(session?.user.role);

  const googleAuthUrl = isOAuthAppConfigured() ? getGoogleAuthUrl() : "";

  const active = students.filter((s) => s.status === "ACTIVE").length;
  const inactive = students.filter((s) => s.status === "INACTIVE").length;
  const withdrawn = students.filter((s) => s.status === "WITHDRAWN").length;
  const graduated = students.filter((s) => s.status === "GRADUATED").length;
  const activeStudents = students.filter((s) => s.status === "ACTIVE");

  return (
    <div className="space-y-4">
      <PageIntro
        tag="STUDENTS · 02"
        title={`원생 · ${active}명 재원 중`}
        description="원생 정보 관리, 일정 확인, 성적 입력"
        stats={[
          { label: "재원", value: active },
          { label: "휴원", value: inactive },
          { label: "졸업", value: graduated },
          { label: "퇴원", value: withdrawn },
        ]}
      />

      <Tabs defaultValue={defaultTab}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger value="list">원생 목록</TabsTrigger>
            <TabsTrigger value="schedule">입퇴실 일정</TabsTrigger>
            <TabsTrigger value="portal-links">포털 링크</TabsTrigger>
            <TabsTrigger value="import">원생 CSV 가져오기</TabsTrigger>
            <TabsTrigger value="scores-import">성적 CSV 업로드</TabsTrigger>
            <TabsTrigger value="sheets">구글 시트 연동</TabsTrigger>
          </TabsList>
          <Link href="/students/new">
            <Button variant="ink" size="compact">
              <Plus className="h-3.5 w-3.5" />
              원생 등록
            </Button>
          </Link>
        </div>

        <TabsContent value="list" className="mt-3">
          <StudentsListView students={students} />
        </TabsContent>

        <TabsContent value="schedule" className="mt-3">
          <StudentsScheduleTable students={activeStudents} />
        </TabsContent>

        <TabsContent value="portal-links" className="mt-3">
          <Card className="rounded-[12px] border-line shadow-[var(--shadow-xs)]">
            <CardContent className="pt-5">
              <div className="mb-3 text-sm text-muted-foreground">
                재원생에게 보낼 본인 전용 학생 포털 링크({portalLinkRows.filter((s) => s.token).length}/{portalLinkRows.length}명 발급됨).
                링크는 30일 후 만료되며 재발급할 수 있어요.
                {!canManagePortalLinks && " (발급·재발급은 원장 권한 필요)"}
              </div>
              <PortalLinksPanel students={portalLinkRows} canManage={canManagePortalLinks} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import" className="mt-3">
          <Card className="rounded-[12px] border-line shadow-[var(--shadow-xs)]">
            <CardContent className="pt-5">
              <CsvImport />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scores-import" className="mt-3">
          <Card className="rounded-[12px] border-line shadow-[var(--shadow-xs)]">
            <CardContent className="pt-5">
              <CsvImportScores />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sheets" className="mt-3">
          <Card className="rounded-[12px] border-line shadow-[var(--shadow-xs)]">
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
