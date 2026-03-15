import { StudentForm } from "@/components/students/student-form";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseSchool } from "@/lib/utils";

export default async function NewStudentPage() {
  const [mentors, schoolRows] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["DIRECTOR", "MENTOR"] } },
      select: { id: true, name: true },
    }),
    prisma.student.findMany({ select: { school: true } }),
  ]);

  const schools = [...new Set(schoolRows.map((s) => parseSchool(s.school ?? "")).filter(Boolean))].sort();

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>원생 등록</CardTitle>
        </CardHeader>
        <CardContent>
          <StudentForm mentors={mentors} schools={schools} />
        </CardContent>
      </Card>
    </div>
  );
}
