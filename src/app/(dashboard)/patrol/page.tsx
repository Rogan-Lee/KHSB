import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { QrCode, ScanLine } from "lucide-react";
import { isStaff } from "@/lib/roles";
import { todayKST } from "@/lib/utils";
import { getPatrolDayRoundsWithRecords } from "@/actions/patrol";
import { PageHeader } from "@/components/backoffice/ui";
import { PatrolReview } from "./_components/patrol-review";

export const dynamic = "force-dynamic";

export default async function PatrolPage() {
  const session = await auth();
  if (!isStaff(session?.user?.role)) redirect("/");

  // 오늘(KST) 날짜 문자열 (todayKST 는 KST 날짜의 UTC 자정 Date)
  const today = todayKST().toISOString().slice(0, 10);

  const rounds = await getPatrolDayRoundsWithRecords(today);

  return (
    <div>
      <PageHeader
        title="순찰 관리"
        description="순찰자(근무자)별 점검 결과와 특이사항을 확인해요."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/patrol/qr">
                <QrCode />
                좌석 QR 인쇄
              </Link>
            </Button>
            <Button asChild size="sm" className="hidden md:inline-flex">
              <Link href="/patrol/run">
                <ScanLine />
                순찰 시작
              </Link>
            </Button>
          </>
        }
      />

      <PatrolReview initialDate={today} initialRounds={rounds} />
    </div>
  );
}
