import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { getAllPayrollData, getPayrollCandidates } from "@/actions/payroll";
import { PageIntro } from "@/components/ui/page-intro";
import { Card, CardContent } from "@/components/ui/card";
import { PayrollAdminBoard } from "@/components/payroll/payroll-admin-board";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  // 비관리자면 /payroll/me 로 리다이렉트
  if (!isFullAccess(session.user.role)) {
    redirect("/payroll/me");
  }

  const now = new Date();
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : now.getFullYear();
  const month = sp.month ? Number(sp.month) : now.getMonth() + 1;

  const [{ staff, tags }, candidates] = await Promise.all([
    getAllPayrollData(year, month),
    getPayrollCandidates(),
  ]);

  return (
    <div className="space-y-4">
      <PageIntro
        tag="PAYROLL · ADMIN"
        title="급여 정산"
        description="직원별 시급 설정 · 출퇴근 태그 수정 · 월 급여 계산"
        accent="text-info"
      />

      <div className="flex justify-end">
        <Link href="/payroll/me">
          <Button variant="outline" size="sm">
            <User className="h-4 w-4 mr-1" />내 기록 보기
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-4">
          <PayrollAdminBoard
            year={year}
            month={month}
            staff={staff.map((s) => ({
              id: s.id,
              name: s.name,
              role: s.role,
              hourlyRate: s.payrollSetting?.hourlyRate ?? null,
              weeklyHolidayPay: s.payrollSetting?.weeklyHolidayPay ?? true,
              record: s.payrollRecords[0] ?? null,
            }))}
            tags={tags}
            candidates={candidates}
          />
        </CardContent>
      </Card>
    </div>
  );
}
