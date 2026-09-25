export const revalidate = 30;

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ConsultationsList } from "@/components/consultations/consultations-table";
import { ConsultationOwnerTabs } from "@/components/consultations/consultation-owner-tabs";
import { Button } from "@/components/ui/button";
import { PageHeader, StatCard, StatCards } from "@/components/backoffice/ui";
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

  return (
    <>
      <PageHeader
        title="면담 관리"
        description={
          isHeadTeacher
            ? "책임 선생님의 면담 일정을 관리하고 결과를 기록해요."
            : "원생별 원장 면담 일정을 관리하고 결과를 기록해요."
        }
        actions={
          <Button asChild>
            <Link href={`/consultations/new?owner=${owner}`}>
              <Plus aria-hidden />
              면담 등록
            </Link>
          </Button>
        }
      />

      {/* Owner tabs */}
      <ConsultationOwnerTabs current={owner} />

      <StatCards cols={3} className="mb-x6">
        <StatCard label="예정" value={scheduled} unit="건" />
        <StatCard label="완료" value={completed} unit="건" />
        <StatCard label="전체" value={total} unit="건" sub="조회 기간 기준" />
      </StatCards>

      {/* List */}
      <ConsultationsList
        consultations={consultations}
        owner={owner}
        initialDateFrom={initialFrom}
        initialDateTo={initialTo}
      />
    </>
  );
}
