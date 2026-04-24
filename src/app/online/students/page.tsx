import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { AddOnlineStudentTabs } from "@/components/online/add-online-student-tabs";
import { ChevronRight } from "lucide-react";

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
          <div className="rounded-[12px] border border-line bg-panel overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead className="bg-canvas-2 text-ink-4 text-[11px] uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">이름</th>
                  <th className="text-left px-3 py-2 font-semibold">학년</th>
                  <th className="text-left px-3 py-2 font-semibold">관리 멘토</th>
                  <th className="text-left px-3 py-2 font-semibold">컨설턴트</th>
                  <th className="text-left px-3 py-2 font-semibold">매직링크</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {onlineStudents.map((s) => {
                  const activeLink = s.magicLinks[0];
                  return (
                    <tr
                      key={s.id}
                      className="border-t border-line hover:bg-canvas-2/50 transition-colors"
                    >
                      <td className="px-3 py-2 font-medium text-ink">
                        <Link href={`/online/students/${s.id}`} className="hover:underline">
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-ink-3">{s.grade}</td>
                      <td className="px-3 py-2 text-ink-3">
                        {s.assignedMentor?.name ?? (
                          <span className="text-ink-5">미배정</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-ink-3">
                        {s.assignedConsultant?.name ?? (
                          <span className="text-ink-5">미배정</span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-ink-3">
                        {activeLink ? (
                          <>
                            ~ {activeLink.expiresAt.toLocaleDateString("ko-KR")}
                          </>
                        ) : (
                          <span className="text-ink-5">없음</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/online/students/${s.id}`}
                          className="text-ink-4 hover:text-ink"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
