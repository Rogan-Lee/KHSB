import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { QrCode } from "lucide-react";
import { isStaff } from "@/lib/roles";
import { todayKST } from "@/lib/utils";
import { getPatrolRounds } from "@/actions/patrol";
import { PageIntro } from "@/components/ui/page-intro";
import { PatrolReview } from "./_components/patrol-review";

export const dynamic = "force-dynamic";

export default async function PatrolPage() {
  const session = await auth();
  if (!isStaff(session?.user?.role)) redirect("/");

  // 오늘(KST) 날짜 문자열 (todayKST 는 KST 날짜의 UTC 자정 Date)
  const today = todayKST().toISOString().slice(0, 10);

  const rounds = await getPatrolRounds(today);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <PageIntro
          tag="PATROL"
          title="순찰 관리"
          description="회차별 순찰 점검 결과와 특이사항을 일괄 확인합니다."
          accent="text-info"
        />
        <Link href="/patrol/qr">
          <Button variant="outline" size="sm">
            <QrCode className="h-4 w-4 mr-1.5" />
            좌석 QR 인쇄
          </Button>
        </Link>
      </div>

      <PatrolReview initialDate={today} initialRounds={rounds} />
    </div>
  );
}
