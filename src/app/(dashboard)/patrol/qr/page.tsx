import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/roles";
import { PageHeader } from "@/components/backoffice/ui";
import { PatrolQrSheet } from "./_components/patrol-qr-sheet";
import { compareSeat } from "@/lib/patrol";

export const revalidate = 60;

export default async function PatrolQrPage() {
  const session = await auth();
  if (!isStaff(session?.user?.role)) redirect("/");

  const students = (
    await prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true, seat: true },
    })
  ).sort(compareSeat);

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          back={{ href: "/patrol", label: "순찰 관리" }}
          title="좌석 QR 스티커"
          description="인쇄해서 학생 책상에 붙여 두면 순찰할 때 QR로 바로 기록할 수 있어요."
        />
      </div>
      <PatrolQrSheet students={students} />
    </div>
  );
}
