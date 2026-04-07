import { StudentForm } from "@/components/students/student-form";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseSchool } from "@/lib/utils";

export default async function NewStudentPage() {
  const user = await getUser();
  if (!user?.orgId) return null;
  const orgId = user.orgId;

  const [mentors, schoolRows, seatRows] = await Promise.all([
    prisma.user.findMany({
      where: { memberships: { some: { orgId } }, role: { in: ["ADMIN", "DIRECTOR", "MENTOR"] } },
      select: { id: true, name: true },
    }),
    prisma.student.findMany({ where: { orgId }, select: { school: true } }),
    prisma.student.findMany({
      where: { orgId, status: "ACTIVE", seat: { not: null } },
      select: { seat: true },
    }),
  ]);

  const schools = [...new Set(schoolRows.map((s) => parseSchool(s.school ?? "")).filter(Boolean))].sort();
  const occupiedSeats = seatRows.map((s) => s.seat!);

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>원생 등록</CardTitle>
        </CardHeader>
        <CardContent>
          <StudentForm mentors={mentors} schools={schools} occupiedSeats={occupiedSeats} />
        </CardContent>
      </Card>
    </div>
  );
}
