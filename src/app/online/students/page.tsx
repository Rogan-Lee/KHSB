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
        <details className="group rounded-[12px] border border-line bg-panel overflow-hidden">
          <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-2 hover:bg-canvas-2/40 transition-colors">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              className="h-3.5 w-3.5 text-ink-4 transition-transform group-open:rotate-90"
              fill="currentColor"
            >
              <path d="M7.05 4.05a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4L11.6 9.75 7.05 5.45a1 1 0 0 1 0-1.4Z" />
            </svg>
            <h2 className="text-[13px] font-semibold text-ink">
              온라인 학생 추가
            </h2>
            <span className="text-[11px] text-ink-5 ml-auto group-open:hidden">
              클릭하여 펼치기
            </span>
            <span className="text-[11px] text-ink-5 ml-auto hidden group-open:inline">
              접기
            </span>
          </summary>
          <div className="px-4 pb-4 pt-1 border-t border-line">
            <AddOnlineStudentTabs
              offlineStudents={offlineStudents}
              mentors={mentors}
              consultants={consultants}
            />
          </div>
        </details>
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
