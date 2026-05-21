export const revalidate = 30;

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MentorManager } from "@/components/mentors/mentor-manager";
import type { StaffMagicLinkRow } from "@/components/admin/staff-magic-link-panel";
import { isFullAccess, STAFF_ROLES } from "@/lib/roles";

export default async function MentorsPage() {
  const session = await auth();
  if (!isFullAccess(session?.user?.role)) redirect("/");

  const [mentors, schedules, links] = await Promise.all([
    prisma.user.findMany({
      // 직원 관리 노출 대상: STAFF_ROLES + 온라인 전용(CONSULTANT, MANAGER_MENTOR)
      where: { role: { in: [...STAFF_ROLES, "CONSULTANT", "MANAGER_MENTOR"] } },
      select: { id: true, name: true, email: true, role: true, phone: true, status: true, terminationNote: true, terminatedAt: true },
      // 재직(ACTIVE) 먼저, 그 안에서 이름순
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    prisma.mentorSchedule.findMany({
      orderBy: [{ mentorId: "asc" }, { dayOfWeek: "asc" }],
    }),
    prisma.staffMagicLink.findMany({
      orderBy: { issuedAt: "desc" },
      select: {
        id: true, userId: true, token: true, issuedAt: true, expiresAt: true,
        revokedAt: true, lastAccessedAt: true, lastAccessIp: true, accessCount: true,
      },
    }),
  ]);

  // 직원별 매직링크 그룹핑 (ISO 직렬화 → 클라이언트 컴포넌트 전달)
  const linksByUser: Record<string, StaffMagicLinkRow[]> = {};
  for (const l of links) {
    (linksByUser[l.userId] ??= []).push({
      id: l.id,
      token: l.token,
      issuedAt: l.issuedAt.toISOString(),
      expiresAt: l.expiresAt.toISOString(),
      revokedAt: l.revokedAt?.toISOString() ?? null,
      lastAccessedAt: l.lastAccessedAt?.toISOString() ?? null,
      lastAccessIp: l.lastAccessIp,
      accessCount: l.accessCount,
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">직원 관리</h1>
      <MentorManager mentors={mentors} schedules={schedules} linksByUser={linksByUser} currentUserId={session?.user?.id ?? ""} />
    </div>
  );
}
