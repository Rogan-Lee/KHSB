import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { TimetablePageClient } from "./timetable-client";

export default async function TimetablePage() {
  const user = await getUser();
  if (!user?.orgId) return null;
  const orgId = user.orgId;

  const students = await prisma.student.findMany({
    where: { orgId, status: "ACTIVE" },
    select: { id: true, name: true, grade: true, school: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">시간표</h1>
      <TimetablePageClient students={students} />
    </div>
  );
}
