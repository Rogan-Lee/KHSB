import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/roles";
import { PatrolQrSheet } from "./_components/patrol-qr-sheet";

export const revalidate = 60;

export default async function PatrolQrPage() {
  const session = await auth();
  if (!isStaff(session?.user?.role)) redirect("/");

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, grade: true, seat: true },
    orderBy: [{ seat: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 print:hidden">
        <Link href="/patrol">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            순찰 관리
          </Button>
        </Link>
        <h1 className="text-xl font-bold">좌석 QR 스티커</h1>
      </div>
      <PatrolQrSheet students={students} />
    </div>
  );
}
