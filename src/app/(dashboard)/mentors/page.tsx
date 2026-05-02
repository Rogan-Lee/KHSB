export const revalidate = 30;

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MentorManager } from "@/components/mentors/mentor-manager";
import { isFullAccess, STAFF_ROLES } from "@/lib/roles";

export default async function MentorsPage() {
  const session = await auth();
  if (!isFullAccess(session?.user?.role)) redirect("/");

  const [mentors, schedules] = await Promise.all([
    prisma.user.findMany({
      // 직원 관리 노출 대상: STAFF_ROLES + 온라인 전용(CONSULTANT, MANAGER_MENTOR)
      where: { role: { in: [...STAFF_ROLES, "CONSULTANT", "MANAGER_MENTOR"] } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.mentorSchedule.findMany({
      orderBy: [{ mentorId: "asc" }, { dayOfWeek: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">직원 관리</h1>
      <MentorManager mentors={mentors} schedules={schedules} />
    </div>
  );
}
