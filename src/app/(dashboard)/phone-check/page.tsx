import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/roles";
import { nowKSTTimeString, todayKST } from "@/lib/utils";
import { currentPeriodNo, periodsFor } from "@/lib/class-periods";
import { getPhoneCheckBoard } from "@/actions/phone-check";
import { PageHeader } from "@/components/backoffice/ui";
import { PhoneCheckBoard } from "./_components/phone-check-board";

export const dynamic = "force-dynamic";

export default async function PhoneCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; period?: string }>;
}) {
  const session = await auth();
  if (!isStaff(session?.user?.role)) redirect("/");

  const today = todayKST().toISOString().slice(0, 10);
  const { date: raw, period: rawPeriod } = await searchParams;
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today;
  const periods = periodsFor(date);
  // 교시를 안 고르면 오늘은 지금 교시, 다른 날은 입실(0)
  const picked = Number(rawPeriod);
  const period =
    rawPeriod !== undefined && (picked === 0 || periods.some((p) => p.no === picked))
      ? picked
      : date === today
        ? currentPeriodNo(date, nowKSTTimeString())
        : 0;

  const rows = await getPhoneCheckBoard(date, period);

  return (
    <div>
      <PageHeader
        title="휴대폰 검사"
        description="입실할 때와 교시마다 휴대폰을 냈는지 학생별로 확인하고 기록해요."
      />
      <PhoneCheckBoard date={date} period={period} periods={periods} initialRows={rows} />
    </div>
  );
}
