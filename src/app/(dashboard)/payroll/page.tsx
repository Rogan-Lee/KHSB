import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { getAllPayrollData, getPayrollCandidates, getMonthlyWorkSheet } from "@/actions/payroll";
import { PageHeader, StatusBadge } from "@/components/backoffice/ui";
import { PayrollAdminBoard } from "@/components/payroll/payroll-admin-board";
import { MonthlyWorkSheet } from "@/components/payroll/monthly-work-sheet";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronDown, User } from "lucide-react";

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
    <>
      <PageHeader
        title="급여 정산"
        description="근무자가 입력한 근무시간을 확인·수정하고 월 급여를 산정해요. 급여 기준(시급/월급)은 근무자별로 설정하세요."
        actions={
          <Button asChild variant="outline">
            <Link href="/payroll/me">
              <User />
              내 기록 보기
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-x8">
        {/* 메인: 월간 근무표 + 급여 산정 */}
        <MonthlyWorkSheet initial={workSheet} />

        {/* 레거시: 출퇴근 태그 기록 (참고용) */}
        <details className="group rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-x3 rounded-r4 px-x5 py-x4 transition-colors group-open:rounded-b-none hover:bg-bg-layer-default-pressed [&::-webkit-details-marker]:hidden">
            <span className="block min-w-0">
              <span className="flex flex-wrap items-center gap-x2">
                <span className="t5-bold text-fg-neutral">출퇴근 태그 기록</span>
                <StatusBadge tone="gray">레거시 · 참고용</StatusBadge>
              </span>
              <span className="mt-x0_5 block t3-regular text-fg-neutral-subtle">
                예전 출퇴근 태그 방식의 기록이에요. 필요할 때만 펼쳐서 확인하세요.
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className="size-5 shrink-0 text-fg-neutral-subtle transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="border-t border-stroke-neutral-muted p-x4 sm:p-x5">
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
    </>
  );
}
