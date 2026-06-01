export const revalidate = 30;

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ConsultationsList } from "@/components/consultations/consultations-table";
import { ConsultationOwnerTabs } from "@/components/consultations/consultation-owner-tabs";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { resolveDateRange } from "@/lib/date-range";

export default async function ConsultationsPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string; from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const { owner: ownerParam, from: fromParam, to: toParam } = await searchParams;
  const owner = ownerParam === "HEAD_TEACHER" ? "HEAD_TEACHER" : "DIRECTOR";

  // 조회 범위(서버 필터). 예정일(scheduledAt) 또는 실제 면담일(actualDate)이 범위에 걸치면 포함.
  // 상한을 +60일로 길게 — 한 달 이상 앞서 예정된 면담도 기본 화면/카운트에 포함.
  const { rangeFrom, rangeTo, initialFrom, initialTo } = resolveDateRange(fromParam, toParam, { daysAhead: 60 });

  const consultations = await prisma.directorConsultation.findMany({
    where: {
      owner,
      OR: [
        { scheduledAt: { gte: rangeFrom, lte: rangeTo } },
        { actualDate: { gte: rangeFrom, lte: rangeTo } },
      ],
    },
    include: { student: { select: { id: true, name: true, grade: true } } },
    orderBy: { scheduledAt: "desc" },
  }) as Array<{
    id: string;
    studentId: string | null;
    prospectName: string | null;
    prospectGrade: string | null;
    type: "STUDENT" | "PARENT" | null;
    category: "ENROLLED" | "NEW_ADMISSION" | "CONSIDERING" | null;
    scheduledAt: Date | null;
    actualDate: Date | null;
    status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
    agenda: string | null;
    notes: string | null;
    outcome: string | null;
    followUp: string | null;
    student: { id: string; name: string; grade: string } | null;
  }>;

  const scheduled = consultations.filter((c) => c.status === "SCHEDULED").length;
  const completed = consultations.filter((c) => c.status === "COMPLETED").length;
  const total = consultations.length;

  const isHeadTeacher = owner === "HEAD_TEACHER";
  const title = isHeadTeacher ? "책임T 면담" : "원장 면담";

  return (
    <div className="space-y-5">
      {/* Owner tabs */}
      <ConsultationOwnerTabs current={owner} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isHeadTeacher
              ? "책임 선생님의 면담 일정을 관리하고 결과를 기록합니다."
              : "원생별 면담 일정을 관리하고 결과를 기록합니다."}
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
          <Link href={`/consultations/new?owner=${owner}`}>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              면담 등록
            </Button>
          </Link>
        </div>
      </div>

      {/* List */}
      <ConsultationsList
        consultations={consultations}
        owner={owner}
        initialDateFrom={initialFrom}
        initialDateTo={initialTo}
      />
    </div>
  );
}
