export const revalidate = 30;

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeatMapBoard } from "@/components/seat-map/seat-map-board";
import { offlineStudentWhere } from "@/lib/student-filters";
import { PageHeader } from "@/components/backoffice/ui";

export default async function SeatMapPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const students = await prisma.student.findMany({
    where: offlineStudentWhere({ status: "ACTIVE" }),
    select: { id: true, name: true, seat: true, grade: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      {/* 인쇄 시에는 보드의 인쇄용 머리(룸·날짜)만 쓴다 */}
      <div className="print:hidden">
        <PageHeader
          title="좌석 배치도"
          description="K룸과 H룸의 좌석 배정 현황이에요. 좌석을 누르면 원생을 배정하거나 바꿀 수 있어요."
        />
      </div>
      <SeatMapBoard students={students} />
    </div>
  );
}
