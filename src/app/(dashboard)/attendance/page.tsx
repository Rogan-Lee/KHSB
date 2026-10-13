import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { FilterLink } from "@/components/attendance/attendance-status";
import { todayKST } from "@/lib/utils";
import { offlineStudentWhere } from "@/lib/student-filters";
import { latestIdsPerGroup } from "@/lib/db/latest-per-group";
import { listStudentPortalLinks } from "@/actions/student-portal-links";
import { isFullAccess } from "@/lib/roles";
import { PortalLinksSheet } from "@/components/attendance/portal-links-sheet";
import { Button } from "@/components/ui/button";
import { PageHeader, StatCard, StatCards } from "@/components/backoffice/ui";
import { requireDashboardSession } from "../_lib/page-guard";

export const revalidate = 30; // 30초 캐싱 (force-dynamic 대비 성능 향상)

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requireDashboardSession();
  const { filter } = await searchParams;
  const isAbsentFilter = filter === "absent";
  const isSelfStudyFilter = filter === "self-study";

  const today = todayKST();
  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const dayOfWeek = kstNow.getUTCDay();
  const nowHHMM = kstNow.toISOString().slice(11, 16); // "HH:MM" KST

  const canManagePortalLinks = isFullAccess(session.user.role);

  // 표가 읽는 필드만 select — 전 컬럼(51개)·관계 전 컬럼 대신 (egress 절감)
  // 포털 링크 목록과 병렬로 — 아래 최근 요청/과제 조회가 한 단계 늘어난 만큼 대기 시간을 줄인다
  const [portalLinkRows, baseStudents] = await Promise.all([
    listStudentPortalLinks(),
    prisma.student.findMany({
      where: offlineStudentWhere({ status: "ACTIVE" }),
      select: {
        id: true,
        name: true,
        seat: true,
        school: true,
        grade: true,
        classGroup: true,
        studentInfo: true,
        changeNote: true,
        dailyNote: true,
        dailyNoteDate: true,
        vocabTestDate: true,
        pledgeDate: true,
        mockAnalysisDate: true,
        schoolAnalysisDate: true,
        plannerSentDate: true,
        weeklyPlanDate: true,
        mockAnalysisExempt: true,
        schoolAnalysisExempt: true,
        attendances: {
          where: { date: today },
          select: { checkIn: true, checkOut: true, type: true, notes: true, isAutoClosed: true },
        },
        schedules: { where: { dayOfWeek }, select: { startTime: true, endTime: true } },
        outings: { where: { dayOfWeek }, select: { outStart: true, outEnd: true } },
        dailyOutings: {
          where: { date: today },
          orderBy: { outStart: "asc" as const },
          select: { id: true, outStart: true, outEnd: true, sequence: true, reason: true },
        },
        vocabEnrollment: { select: { isActive: true } },
        timetableEntries: {
          where: { dayOfWeek },
          select: { startTime: true, endTime: true, subject: true },
        },
      },
      orderBy: { seat: "asc" },
    }),
  ]);

  // 요청/전달(최근 30)·과제(최근 20) — 목록의 중첩 take 는 DB 에서 안 잘려 학생 전원의 이력을 다 가져오므로
  // 학생별 최신 id 만 DB 에서 고른 뒤 필요한 컬럼만 조회한다.
  const studentIds = baseStudents.map((s) => s.id);
  const [commIds, assignIds] = await Promise.all([
    latestIdsPerGroup({
      table: "Communication",
      groupBy: "studentId",
      groupIds: studentIds,
      orderBy: [{ column: "createdAt", dir: "desc" }],
      take: 30,
    }),
    latestIdsPerGroup({
      table: "Assignment",
      groupBy: "studentId",
      groupIds: studentIds,
      orderBy: [{ column: "createdAt", dir: "desc" }],
      take: 20,
    }),
  ]);
  const [commRows, assignRows] = await Promise.all([
    commIds.length
      ? prisma.communication.findMany({
          where: { id: { in: commIds } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true, studentId: true, type: true, content: true, isChecked: true,
            checkedAt: true, createdByName: true, createdAt: true,
          },
        })
      : [],
    assignIds.length
      ? prisma.assignment.findMany({
          where: { id: { in: assignIds } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true, studentId: true, title: true, subject: true, description: true, dueDate: true,
            isCompleted: true, completedAt: true, completedNote: true, createdByName: true,
          },
        })
      : [],
  ]);
  const commsByStudent = groupByStudent(commRows);
  const assignsByStudent = groupByStudent(assignRows);
  const students = baseStudents.map((s) => ({
    ...s,
    communications: commsByStudent.get(s.id) ?? [],
    assignments: assignsByStudent.get(s.id) ?? [],
  }));

  const withSchedule = students.filter((s) => s.schedules.length > 0);
  const normal = withSchedule.filter((s) => s.attendances[0]?.type === "NORMAL").length;
  const absent = withSchedule.filter(
    (s) => s.attendances[0]?.type === "ABSENT" || (!s.attendances[0])
  ).length;
  const notifiedAbsent = withSchedule.filter((s) => s.attendances[0]?.type === "NOTIFIED_ABSENT").length;
  const tardy = withSchedule.filter((s) => s.attendances[0]?.type === "TARDY").length;
  const noSchedule = students.filter((s) => s.schedules.length === 0).length;

  // 현재 시간 기준 입실 기록 없는 원생: 예정 입실 시각이 지났고 아직 체크인 안 된 원생
  const absentNowList = withSchedule.filter((s) => {
    const schedIn = s.schedules[0]?.startTime;
    if (!schedIn || schedIn === "FLEXIBLE") return false;
    if (s.attendances[0]?.checkIn) return false;
    return schedIn <= nowHHMM;
  });
  const absentNowCount = absentNowList.length;

  // 현재 시간 기준 자습 중인 원생: 이 시각에 학원/과외 등 외부 일정이 없는 원생.
  // 시간표 entry가 현재 시각을 덮지 않거나, 덮더라도 subject에 "자습" 포함이면 해당.
  const selfStudyNowList = students.filter((s) => {
    const currentEntry = s.timetableEntries.find(
      (e) => e.startTime <= nowHHMM && nowHHMM < e.endTime,
    );
    if (!currentEntry) return true;
    return currentEntry.subject.includes("자습");
  });
  const selfStudyNowCount = selfStudyNowList.length;

  const visibleStudents = isAbsentFilter
    ? absentNowList
    : isSelfStudyFilter
    ? selfStudyNowList
    : students;

  const dateLabel = today.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  });

  // 표 위 필터 칩 — URL(searchParams) 기반. 다시 누르면 전체 보기로 돌아간다.
  const filterChips = (
    <div className="flex flex-wrap items-center gap-x2" role="group" aria-label="보기 필터">
      <FilterLink href="/attendance" selected={!isAbsentFilter && !isSelfStudyFilter} count={students.length}>
        전체
      </FilterLink>
      <FilterLink
        href={isAbsentFilter ? "/attendance" : "/attendance?filter=absent"}
        selected={isAbsentFilter}
        count={absentNowCount}
        title="현재 시각 기준, 예정 입실 시각이 지났는데 아직 입실하지 않은 원생"
      >
        지금 결석
      </FilterLink>
      <FilterLink
        href={isSelfStudyFilter ? "/attendance" : "/attendance?filter=self-study"}
        selected={isSelfStudyFilter}
        count={selfStudyNowCount}
        title="현재 시각 기준 시간표상 자습 중이어야 할 원생"
      >
        지금 자습 중
      </FilterLink>
    </div>
  );

  return (
    <div className="flex flex-col gap-x6">
      <PageHeader
        className="mb-0 md:mb-0"
        title="입퇴실 관리"
        description={`${dateLabel} · 등원 예정 ${withSchedule.length}명`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/attendance/schedule">
                <CalendarClock />
                등원 일정
              </Link>
            </Button>
            <PortalLinksSheet rows={portalLinkRows} canManage={canManagePortalLinks} />
          </>
        }
      />

      <StatCards cols={5}>
        <StatCard label="정상" value={normal} unit="명" tone={normal > 0 ? "ok" : "gray"} />
        <StatCard label="결석" value={absent} unit="명" tone={absent > 0 ? "bad" : "gray"} />
        <StatCard label="지각" value={tardy} unit="명" tone={tardy > 0 ? "warn" : "gray"} />
        <StatCard label="미입실" value={notifiedAbsent} unit="명" sub="사전 연락" />
        <StatCard label="비등원일" value={noSchedule} unit="명" className="col-span-2 lg:col-span-1" />
      </StatCards>

      <AttendanceTable students={visibleStudents} today={today.toISOString()} toolbarStart={filterChips} />
    </div>
  );
}

function groupByStudent<T extends { studentId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const list = map.get(r.studentId);
    if (list) list.push(r);
    else map.set(r.studentId, [r]);
  }
  return map;
}
