import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConsultationDialog } from "@/components/consultations/consultation-dialog";
import { ConsultationsTable } from "@/components/consultations/consultations-table";

export default async function ConsultationsPage() {
  const [consultations, students] = await Promise.all([
    prisma.directorConsultation.findMany({
      include: { student: { select: { id: true, name: true, grade: true } } },
      orderBy: { scheduledAt: "desc" },
    }),
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const upcoming = consultations.filter((c) => c.status === "SCHEDULED").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">예정된 면담</p>
            <p className="text-2xl font-bold">{upcoming}건</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>원장 면담 기록</CardTitle>
          <ConsultationDialog students={students} />
        </CardHeader>
        <CardContent>
          <ConsultationsTable consultations={consultations} />
        </CardContent>
      </Card>
    </div>
  );
}
