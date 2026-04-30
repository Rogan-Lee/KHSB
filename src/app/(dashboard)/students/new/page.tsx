import { StudentForm } from "@/components/students/student-form";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseSchool } from "@/lib/utils";

export default async function NewStudentPage() {
  const [mentors, schoolRows, seatRows] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "DIRECTOR", "HEAD_MENTOR", "MENTOR"] } },
      select: { id: true, name: true },
    }),
    prisma.student.findMany({ select: { school: true } }),
    prisma.student.findMany({
      where: { status: "ACTIVE", seat: { not: null } },
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
