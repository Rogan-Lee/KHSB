import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MentorManager } from "@/components/mentors/mentor-manager";

export default async function MentorsPage() {
  const session = await auth();
  if (session?.user?.role !== "DIRECTOR") redirect("/");

  const [mentors, schedules] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["MENTOR", "STAFF", "DIRECTOR"] } },
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
