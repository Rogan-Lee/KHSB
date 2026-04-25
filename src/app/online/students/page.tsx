import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { AddOnlineStudentTabs } from "@/components/online/add-online-student-tabs";
import {
  OnlineStudentsTable,
  type OnlineStudentRow,
} from "@/components/online/online-students-table";

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
          take: 1,
          select: { expiresAt: true, lastAccessedAt: true },
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink tracking-[-0.015em]">
          온라인 학생
        </h1>
        <p className="mt-1 text-[13px] text-ink-4">
          총 {onlineStudents.length}명 · 재택/기숙형 원격 관리 대상
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

      <section>
        {onlineStudents.length === 0 ? (
          <div className="rounded-[12px] border border-line bg-panel p-8 text-center text-[13px] text-ink-4">
            온라인 관리 학생이 아직 없습니다.
          </div>
        ) : (
          <OnlineStudentsTable
            rows={onlineStudents.map<OnlineStudentRow>((s) => ({
              id: s.id,
              studentName: s.name,
              grade: s.grade,
              school: s.school,
              assignedMentorName: s.assignedMentor?.name ?? null,
              assignedConsultantName: s.assignedConsultant?.name ?? null,
              magicLinkExpiresAt:
                s.magicLinks[0]?.expiresAt.toISOString() ?? null,
            }))}
          />
        )}
      </section>
    </div>
  );
}
