import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isFullAccess, isOnlineStaff } from "@/lib/roles";
import { Users } from "lucide-react";
import { EmptyState, PageHeader, Section } from "@/components/backoffice/ui";
import { AddOnlineStudentDialog } from "./_components/add-online-student-dialog";
import {
  OnlineStudentsPanel,
  type OnlineStudentPanelRow,
} from "@/components/online/online-students-panel";

export default async function OnlineStudentsPage() {
  const user = await getUser();
  // 온라인 학생 로스터는 온라인 직원 전용 (레이아웃은 전 직원 허용으로 완화됨)
  if (!isOnlineStaff(user?.role)) redirect("/");
  const canManage = isFullAccess(user?.role);

  const [onlineStudents, offlineStudents, mentors, consultants, staffs] = await Promise.all([
    prisma.student.findMany({
      // 재원/퇴원 처리 가능하도록 WITHDRAWN 도 함께 조회
      where: { isOnlineManaged: true, status: { in: ["ACTIVE", "WITHDRAWN"] } },
      orderBy: [{ status: "asc" }, { grade: "asc" }, { name: "asc" }],
      include: {
        assignedMentor: { select: { id: true, name: true } },
        assignedConsultant: { select: { id: true, name: true } },
        assignedStaff: { select: { id: true, name: true } },
        magicLinks: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { issuedAt: "desc" },
        },
        mentoringSessions: {
          orderBy: { scheduledAt: "desc" },
          take: 20,
          include: {
            host: { select: { name: true } },
            photos: { orderBy: { uploadedAt: "asc" } },
          },
        },
        _count: {
          select: {
            performanceTasks: {
              where: {
                status: { not: "DONE" },
                submissions: { some: { feedbacks: { none: {} } } },
              },
            },
          },
        },
      },
    }),
    canManage
      ? prisma.student.findMany({
          where: { isOnlineManaged: false, status: "ACTIVE" },
          orderBy: [{ grade: "asc" }, { name: "asc" }],
          select: { id: true, name: true, grade: true },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.user.findMany({
          // 관리 멘토 picker — 퇴사자 제외
          // MANAGER_MENTOR 외에도 멘토/운영조교/총괄멘토(/원장/SA) 도 배정 가능
          where: { status: "ACTIVE", role: { in: ["MANAGER_MENTOR", "MENTOR", "STAFF", "HEAD_MENTOR", "DIRECTOR", "SUPER_ADMIN"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.user.findMany({
          // 컨설턴트 picker — 퇴사자 제외. CONSULTANT + SUPER_ADMIN(테스트용)
          where: { status: "ACTIVE", role: { in: ["CONSULTANT", "SUPER_ADMIN"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.user.findMany({
          // 운영조교 picker — 퇴사자 제외. STAFF + SUPER_ADMIN(테스트용)
          where: { status: "ACTIVE", role: { in: ["STAFF", "SUPER_ADMIN"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const portalOrigin = `${proto}://${host}`;

  const rows: OnlineStudentPanelRow[] = onlineStudents.map((s) => ({
    studentId: s.id,
    studentName: s.name,
    grade: s.grade,
    school: s.school,
    status: s.status,
    onlineStartedAt: s.onlineStartedAt?.toISOString() ?? null,
    parentPhone: s.parentPhone,
    parentEmail: s.parentEmail,
    targetUniversity: s.targetUniversity,
    selectedSubjects: s.selectedSubjects,
    admissionType: s.admissionType,
    assignedMentorId: s.assignedMentorId,
    assignedConsultantId: s.assignedConsultantId,
    assignedStaffId: s.assignedStaffId,
    assignedMentorName: s.assignedMentor?.name ?? null,
    assignedConsultantName: s.assignedConsultant?.name ?? null,
    assignedStaffName: s.assignedStaff?.name ?? null,
    activeLinks: s.magicLinks.map((l) => ({
      id: l.id,
      token: l.token,
      expiresAt: l.expiresAt.toISOString(),
      issuedAt: l.issuedAt.toISOString(),
      lastAccessedAt: l.lastAccessedAt?.toISOString() ?? null,
      accessCount: l.accessCount,
    })),
    pendingFeedbackCount: s._count.performanceTasks,
    upcomingSessionCount: s.mentoringSessions.filter(
      (ms) =>
        (ms.status === "SCHEDULED" || ms.status === "IN_PROGRESS") &&
        ms.scheduledAt.getTime() > Date.now()
    ).length,
    mentoringSessions: s.mentoringSessions.map((ms) => ({
      id: ms.id,
      title: ms.title,
      status: ms.status,
      scheduledAt: ms.scheduledAt.toISOString(),
      durationMinutes: ms.durationMinutes,
      meetUrl: ms.meetUrl,
      calendarHtmlLink: ms.calendarHtmlLink,
      notes: ms.notes,
      summary: ms.summary,
      hostName: ms.host.name,
      photos: ms.photos,
    })),
  }));

  const activeCount = onlineStudents.filter((s) => s.status === "ACTIVE").length;
  const withdrawnCount = onlineStudents.length - activeCount;

  const addButton = canManage ? (
    <AddOnlineStudentDialog
      offlineStudents={offlineStudents}
      mentors={mentors}
      consultants={consultants}
    />
  ) : undefined;

  return (
    <div>
      <PageHeader
        title="온라인 학생"
        description={
          <>
            <span className="tabular-nums">
              총 {onlineStudents.length}명
              {withdrawnCount > 0 && ` (재원 ${activeCount} · 퇴원 ${withdrawnCount})`}
            </span>
            {" · "}학생을 고르면 정보·담당자·매직링크·화상 세션을 한 화면에서 관리해요
          </>
        }
        actions={addButton}
      />

      {onlineStudents.length === 0 ? (
        <Section>
          <EmptyState
            icon={Users}
            title="아직 온라인 관리 학생이 없어요"
            description={
              canManage
                ? "학생 추가에서 새로 등록하거나 오프라인 학생을 전환해 보세요"
                : "원장님이 온라인 학생을 등록하면 여기에 나타나요"
            }
            action={addButton}
          />
        </Section>
      ) : (
        <OnlineStudentsPanel
          rows={rows}
          mentors={mentors}
          consultants={consultants}
          staffs={staffs}
          portalOrigin={portalOrigin}
          canManage={canManage}
        />
      )}
    </div>
  );
}
