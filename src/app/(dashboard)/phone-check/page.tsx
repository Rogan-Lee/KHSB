import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/roles";
import { todayKST } from "@/lib/utils";
import { getPhoneCheckBoard } from "@/actions/phone-check";
import { PageHeader } from "@/components/backoffice/ui";
import { PhoneCheckBoard } from "./_components/phone-check-board";

export const dynamic = "force-dynamic";

export default async function PhoneCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  if (!isStaff(session?.user?.role)) redirect("/");

  const today = todayKST().toISOString().slice(0, 10);
  const { date: raw } = await searchParams;
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today;

  const rows = await getPhoneCheckBoard(date);

  return (
    <div>
      <PageHeader
        title="휴대폰 검사"
        description="입실할 때 휴대폰을 냈는지 학생별로 확인하고 기록해요."
      />
      <PhoneCheckBoard date={date} initialRows={rows} />
    </div>
  );
}
