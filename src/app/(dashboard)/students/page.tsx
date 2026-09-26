export const revalidate = 30;

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { CountBadge, PageHeader, Section } from "@/components/backoffice/ui";
import { StudentsScheduleTable } from "@/components/students/students-schedule-table";
import { StudentsListView } from "@/components/students/students-list-view";
import { CsvImport } from "@/components/students/csv-import";
import { CsvImportScores } from "@/components/students/csv-import-scores";
import { SheetsImport } from "@/components/students/sheets-import";
import { getGoogleSheetsConfig } from "@/actions/google-sheets";
import { isGoogleCalendarConfigured, getGoogleAuthUrl, isOAuthAppConfigured } from "@/lib/google-calendar";
import { offlineStudentWhere } from "@/lib/student-filters";
import { listStudentPortalLinks } from "@/actions/student-portal-links";
import { isFullAccess, isStaff } from "@/lib/roles";
import { PortalLinksPanel } from "@/components/students/portal-links-panel";
import { PreRegistrationPanel } from "@/components/students/pre-registration-panel";
import { listPreRegistrations } from "@/actions/pre-registrations";
import { GradePromotionDialog } from "@/components/students/grade-promotion-dialog";
import { requireDashboardSession } from "../_lib/page-guard";

const VALID_TABS = ["list", "schedule", "pre-registration", "import", "scores-import", "sheets", "portal-links"] as const;
type TabValue = (typeof VALID_TABS)[number];

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireDashboardSession();
  const { tab } = await searchParams;
  const defaultTab: TabValue = (VALID_TABS as readonly string[]).includes(tab ?? "")
    ? (tab as TabValue)
    : "list";

  const [students, studentsSheetConfig, scoresSheetConfig, googleConnected, portalLinkRows] = await Promise.all([
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
  ]);
  const preRegistrations = await listPreRegistrations();
  // 포털 링크 발급/재발급은 운영자 전원 허용, 사전등록 정식 전환은 원장 유지
  const canManagePortalLinks = isStaff(session.user.role);
  const canFormalize = isFullAccess(session.user.role);

  const googleAuthUrl = isOAuthAppConfigured() ? getGoogleAuthUrl() : "";

  const active = students.filter((s) => s.status === "ACTIVE").length;
  const inactive = students.filter((s) => s.status === "INACTIVE").length;
  const withdrawn = students.filter((s) => s.status === "WITHDRAWN").length;
  const graduated = students.filter((s) => s.status === "GRADUATED").length;
  const activeStudents = students.filter((s) => s.status === "ACTIVE");

  const issuedLinks = portalLinkRows.filter((s) => s.token).length;

  return (
    <div>
      <PageHeader
        title="원생 관리"
        description={
          <span className="tabular-nums">
            재원 {active}명 · 휴원 {inactive}명 · 졸업 {graduated}명 · 퇴원 {withdrawn}명
          </span>
        }
        actions={
          <>
            {canFormalize && <GradePromotionDialog />}
            <Button asChild>
              <Link href="/students/new">
                <Plus />
                원생 등록
              </Link>
            </Button>
          </>
        }
      />

      <Tabs defaultValue={defaultTab}>
        <TabsList aria-label="원생 관리 메뉴">
          <TabsTrigger value="list">원생 목록</TabsTrigger>
          <TabsTrigger value="schedule">입퇴실 일정</TabsTrigger>
          <TabsTrigger value="pre-registration">
            예비등록
            <CountBadge count={preRegistrations.length} />
          </TabsTrigger>
          <TabsTrigger value="portal-links">포털 링크</TabsTrigger>
          <TabsTrigger value="import">원생 CSV 가져오기</TabsTrigger>
          <TabsTrigger value="scores-import">성적 CSV 업로드</TabsTrigger>
          <TabsTrigger value="sheets">구글 시트 연동</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <StudentsListView students={students} />
        </TabsContent>

        <TabsContent value="schedule">
          <StudentsScheduleTable students={activeStudents} />
        </TabsContent>

        <TabsContent value="pre-registration">
          <PreRegistrationPanel initial={preRegistrations} canFormalize={canFormalize} />
        </TabsContent>

        <TabsContent value="portal-links">
          <Section
            variant="plain"
            title="학생 포털 링크"
            description={
              <span className="tabular-nums">
                재원생에게 보낼 본인 전용 학생 포털 링크예요 ({issuedLinks}/{portalLinkRows.length}명 발급됨). 링크는 30일 후 만료되며 재발급할 수 있어요.
              </span>
            }
          >
            <PortalLinksPanel students={portalLinkRows} canManage={canManagePortalLinks} />
          </Section>
        </TabsContent>

        <TabsContent value="import">
          <CsvImport />
        </TabsContent>

        <TabsContent value="scores-import">
          <CsvImportScores />
        </TabsContent>

        <TabsContent value="sheets">
          <SheetsImport
            studentsConfig={studentsSheetConfig ? { sheetUrl: studentsSheetConfig.sheetUrl, sheetName: studentsSheetConfig.sheetName } : null}
            scoresConfig={scoresSheetConfig ? { sheetUrl: scoresSheetConfig.sheetUrl, sheetName: scoresSheetConfig.sheetName } : null}
            googleAuthUrl={googleAuthUrl}
            isGoogleConnected={googleConnected}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
