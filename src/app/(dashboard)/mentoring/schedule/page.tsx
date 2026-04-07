import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MentorScheduleEditor } from "@/components/mentoring/mentor-schedule-editor";
import { isFullAccess } from "@/lib/roles";

export default async function MentorSchedulePage() {
  const user = await getUser();
  if (!user?.orgId) return null;
  const orgId = user.orgId;
  const session = { user };
  const isDirector = isFullAccess(session?.user?.role);

  const mentors = isDirector
    ? await prisma.user.findMany({
        where: { memberships: { some: { orgId } }, isMentor: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [{ id: session!.user!.id, name: session!.user!.name ?? "" }];

  const schedules = await prisma.mentorSchedule.findMany({
    where: isDirector ? { orgId } : { orgId, mentorId: session!.user!.id },
    include: { mentor: { select: { id: true, name: true } } },
    orderBy: { dayOfWeek: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">멘토 주간 스케줄</h1>
      <MentorScheduleEditor
        mentors={mentors}
        schedules={schedules}
        defaultMentorId={session!.user!.id}
        isDirector={isDirector}
      />
    </div>
  );
}
