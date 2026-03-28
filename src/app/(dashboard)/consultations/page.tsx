import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ConsultationDialog } from "@/components/consultations/consultation-dialog";
import { ConsultationsList } from "@/components/consultations/consultations-table";

export default async function ConsultationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

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

  const scheduled = consultations.filter((c) => c.status === "SCHEDULED").length;
  const completed = consultations.filter((c) => c.status === "COMPLETED").length;
  const total = consultations.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">원장 면담</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            원생별 면담 일정을 관리하고 결과를 기록합니다.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-100">
              예정 {scheduled}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-100">
              완료 {completed}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium border">
              전체 {total}
            </span>
          </div>
          <ConsultationDialog students={students} />
        </div>
      </div>

      {/* List */}
      <ConsultationsList consultations={consultations} />
    </div>
  );
}
