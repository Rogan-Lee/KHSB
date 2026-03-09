import { StudentForm } from "@/components/students/student-form";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewStudentPage() {
  const mentors = await prisma.user.findMany({
    where: { role: { in: ["DIRECTOR", "MENTOR"] } },
    select: { id: true, name: true },
  });

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>원생 등록</CardTitle>
        </CardHeader>
        <CardContent>
          <StudentForm mentors={mentors} />
        </CardContent>
      </Card>
    </div>
  );
}
