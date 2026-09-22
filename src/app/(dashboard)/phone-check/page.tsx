import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/roles";
import { todayKST } from "@/lib/utils";
import { getPhoneCheckBoard } from "@/actions/phone-check";
import { PageIntro } from "@/components/ui/page-intro";
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
    <div className="space-y-6">
      <PageIntro
        tag="PHONE CHECK"
        title="휴대폰 검사"
        description="입실 시 휴대폰 제출 여부를 학생별로 검사하고 기록합니다."
        accent="text-info"
      />
      <PhoneCheckBoard date={date} initialRows={rows} />
    </div>
  );
}
