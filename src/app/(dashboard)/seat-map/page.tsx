export const revalidate = 30;

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeatMapBoard } from "@/components/seat-map/seat-map-board";
import { offlineStudentWhere } from "@/lib/student-filters";

export default async function SeatMapPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const students = await prisma.student.findMany({
    where: offlineStudentWhere({ status: "ACTIVE" }),
    select: { id: true, name: true, seat: true, grade: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1e2124]">좌석 배치도</h1>
        <p className="text-sm text-muted-foreground mt-1">
          K룸과 H룸의 좌석 배치 현황입니다. 원생 관리에서 좌석번호를 수정할 수 있습니다.
        </p>
      </div>
      <SeatMapBoard students={students} />
    </div>
  );
}
