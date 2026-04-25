import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { AddOnlineStudentTabs } from "@/components/online/add-online-student-tabs";
import {
  OnlineStudentsPanel,
  type OnlineStudentPanelRow,
} from "@/components/online/online-students-panel";

export default async function OnlineStudentsPage() {
  const user = await getUser();
  const canManage = isFullAccess(user?.role);

  const [onlineStudents, offlineStudents, mentors, consultants] = await Promise.all([
    prisma.student.findMany({
      where: { isOnlineManaged: true, status: "ACTIVE" },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      include: {
        assignedMentor: { select: { id: true, name: true } },
        assignedConsultant: { select: { id: true, name: true } },
        magicLinks: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { issuedAt: "desc" },
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
          where: { role: "MANAGER_MENTOR" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    canManage
      ? prisma.user.findMany({
          where: { role: "CONSULTANT" },
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
    onlineStartedAt: s.onlineStartedAt?.toISOString() ?? null,
    parentPhone: s.parentPhone,
    parentEmail: s.parentEmail,
    targetUniversity: s.targetUniversity,
    selectedSubjects: s.selectedSubjects,
    admissionType: s.admissionType,
    assignedMentorId: s.assignedMentorId,
    assignedConsultantId: s.assignedConsultantId,
    assignedMentorName: s.assignedMentor?.name ?? null,
    assignedConsultantName: s.assignedConsultant?.name ?? null,
    activeLinks: s.magicLinks.map((l) => ({
      id: l.id,
      token: l.token,
      expiresAt: l.expiresAt.toISOString(),
      issuedAt: l.issuedAt.toISOString(),
      lastAccessedAt: l.lastAccessedAt?.toISOString() ?? null,
      accessCount: l.accessCount,
    })),
    pendingFeedbackCount: s._count.performanceTasks,
  }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          온라인 학생
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          총 {onlineStudents.length}명 · 좌측에서 학생 선택 → 우측에서 정보·담당자·매직링크·하위 페이지 진입까지 모두 처리
        </p>
      </header>

      {canManage && (
        <section className="rounded-[12px] border border-line bg-panel p-4">
          <h2 className="text-[13px] font-semibold text-ink mb-3">
            온라인 학생 추가
          </h2>
          <AddOnlineStudentTabs
            offlineStudents={offlineStudents}
            mentors={mentors}
            consultants={consultants}
          />
        </section>
      )}

      {onlineStudents.length === 0 ? (
        <div className="rounded-[12px] border border-line bg-panel p-8 text-center text-[13px] text-ink-4">
          온라인 관리 학생이 아직 없습니다. 위에서 추가해 주세요.
        </div>
      ) : (
        <OnlineStudentsPanel
          rows={rows}
          mentors={mentors}
          consultants={consultants}
          portalOrigin={portalOrigin}
          canManage={canManage}
        />
      )}
    </div>
  );
}
