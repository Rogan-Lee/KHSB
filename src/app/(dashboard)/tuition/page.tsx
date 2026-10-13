import { currentYearMonthKST } from "@/lib/online/month";
import { isFullAccess, isStaff } from "@/lib/roles";
import { getTuitionAdminData } from "@/lib/tuition/admin-data";
import { requireDashboardSession } from "../_lib/page-guard";
import { TuitionAdmin } from "./_components/tuition-admin";

export const dynamic = "force-dynamic";

export default async function TuitionPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  // 조회·현장 결제 확인은 자습실 직원 전체. 발행·환불·금액 합계는 원장급만 — 합계는 서버에서부터 내려 주지 않는다.
  const session = await requireDashboardSession(isStaff);
  const fullAccess = isFullAccess(session.user.role);

  const { ym: ymParam } = await searchParams;
  const ym = ymParam && /^20\d{2}-(0[1-9]|1[0-2])$/.test(ymParam) ? ymParam : currentYearMonthKST();

  const data = await getTuitionAdminData({ ym, fullAccess });

  // 달을 옮기면 선택·필터 같은 화면 상태를 새로 시작한다
  return <TuitionAdmin key={data.ym} data={data} fullAccess={fullAccess} />;
}
