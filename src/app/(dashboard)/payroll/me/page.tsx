import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMyWorkSheet } from "@/actions/payroll";
import { PageHeader } from "@/components/backoffice/ui";
import { MyWorkHoursPanel } from "@/components/payroll/my-work-hours-panel";

export const dynamic = "force-dynamic";

export default async function MyPayrollPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth() + 1;

  const sheet = await getMyWorkSheet(year, month);

  return (
    <>
      <PageHeader
        title="내 근무시간"
        description="매일 근무한 시간을 입력하면 급여가 자동으로 계산돼요. 달이 끝나면 본인 확인을 눌러주세요."
      />
      <MyWorkHoursPanel initial={sheet} year={year} month={month} />
    </>
  );
}
