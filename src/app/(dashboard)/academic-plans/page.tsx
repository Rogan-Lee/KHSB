import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AcademicPlanEditor } from "@/components/academic-plans/academic-plan-editor";

export default async function AcademicPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const user = await getUser();
  if (!user?.orgId) return null;
  const orgId = user.orgId;

  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const [students, plans] = await Promise.all([
    prisma.student.findMany({
      where: { orgId, status: "ACTIVE" },
      select: { id: true, name: true, grade: true },
      orderBy: { name: "asc" },
    }),
    prisma.academicPlan.findMany({
      where: { orgId, year, month },
      include: { student: { select: { id: true, name: true, grade: true } } },
    }),
  ]);

  const planMap = Object.fromEntries(plans.map((p) => [p.studentId, p]));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{year}년 {month}월 학업 플래닝</CardTitle>
        </CardHeader>
        <CardContent>
          <AcademicPlanEditor
            students={students}
            planMap={planMap}
            year={year}
            month={month}
          />
        </CardContent>
      </Card>
    </div>
  );
}
