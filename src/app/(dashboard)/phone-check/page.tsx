import { isStaff } from "@/lib/roles";
import { nowKSTTimeString, todayKST } from "@/lib/utils";
import { currentPeriodNo, periodsFor } from "@/lib/class-periods";
import { getPhoneCheckBoard } from "@/actions/phone-check";
import { PageHeader } from "@/components/backoffice/ui";
import { requireDashboardSession } from "../_lib/page-guard";
import { PhoneCheckBoard } from "./_components/phone-check-board";

export const dynamic = "force-dynamic";

export default async function PhoneCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; period?: string }>;
}) {
  await requireDashboardSession(isStaff);

  const today = todayKST().toISOString().slice(0, 10);
  const { date: raw, period: rawPeriod } = await searchParams;
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today;
  const periods = periodsFor(date);
  const current = date === today ? currentPeriodNo(date, nowKSTTimeString()) : null;
  // 교시를 안 고르면 오늘은 지금 교시, 다른 날은 입실(0). 오늘 아직 안 온 교시는 지금 교시로.
  const picked = Number(rawPeriod);
  const valid = rawPeriod !== undefined && (picked === 0 || periods.some((p) => p.no === picked));
  const period = valid && (current === null || picked <= current) ? picked : (current ?? 0);

  const board = await getPhoneCheckBoard(date, period);

  return (
    <div>
      <PageHeader
        title="휴대폰 검사"
        description="보관함 앞에서 화면과 실제를 맞춰 보고, 다른 칸만 눌러 교시마다 기록해요."
      />
      <PhoneCheckBoard
        board={board}
        periods={periods}
        currentPeriod={current}
        serverNow={new Date().toISOString()}
      />
    </div>
  );
}
