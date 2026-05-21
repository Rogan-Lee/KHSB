import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { getAllPayrollData, getPayrollCandidates, getMonthlyWorkSheet } from "@/actions/payroll";
import { PageIntro } from "@/components/ui/page-intro";
import { Card, CardContent } from "@/components/ui/card";
import { PayrollAdminBoard } from "@/components/payroll/payroll-admin-board";
import { MonthlyWorkSheet } from "@/components/payroll/monthly-work-sheet";
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

  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : kstNow.getUTCFullYear();
  const month = sp.month ? Number(sp.month) : kstNow.getUTCMonth() + 1;

  const [workSheet, { staff, tags }, candidates] = await Promise.all([
    getMonthlyWorkSheet(year, month),
    getAllPayrollData(year, month),
    getPayrollCandidates(),
  ]);

  return (
    <div className="space-y-4">
      <PageIntro
        tag="PAYROLL · ADMIN"
        title="급여 정산"
        description="근무자가 입력한 근무시간을 한 표에서 확인 · 수정하고, 월 급여를 산정합니다. 급여 기준(시급/월급)은 근무자별로 설정하세요."
        accent="text-info"
      />

      <div className="flex justify-end">
        <Link href="/payroll/me">
          <Button variant="outline" size="sm">
            <User className="h-4 w-4 mr-1" />내 기록 보기
          </Button>
        </Link>
      </div>

      {/* 메인: 월간 근무표 + 급여 산정 */}
      <Card>
        <CardContent className="pt-4">
          <MonthlyWorkSheet initial={workSheet} />
        </CardContent>
      </Card>

      {/* 레거시: 출퇴근 태그 기록 (참고용) */}
      <details className="rounded-xl border border-line bg-panel">
        <summary className="cursor-pointer px-4 py-3 text-[13px] font-semibold text-ink-3">
          출퇴근 태그 기록 (레거시 · 참고용)
        </summary>
        <div className="border-t border-line-2 p-4">
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
        </div>
      </details>
    </div>
  );
}
