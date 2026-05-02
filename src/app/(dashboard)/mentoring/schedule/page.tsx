import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MentorScheduleEditor } from "@/components/mentoring/mentor-schedule-editor";
import { isFullAccess } from "@/lib/roles";

export default async function MentorSchedulePage() {
  const session = await auth();
  const role = session?.user?.role;
  // 총괄 멘토(HEAD_MENTOR)도 멘토 전원 스케줄 조회·편집 가능
  const canManageAll = isFullAccess(role) || role === "HEAD_MENTOR";

  const mentors = canManageAll
    ? await prisma.user.findMany({
        where: { isMentor: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [{ id: session!.user!.id, name: session!.user!.name ?? "" }];

  const schedules = await prisma.mentorSchedule.findMany({
    where: canManageAll ? undefined : { mentorId: session!.user!.id },
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
        isDirector={canManageAll}
      />
    </div>
  );
}
