import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMyWorkSheet } from "@/actions/payroll";
import { PageIntro } from "@/components/ui/page-intro";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="space-y-4">
      <PageIntro
        tag="PAYROLL · ME"
        title="내 근무시간"
        description="매일 근무한 시간을 직접 입력하세요. 입력한 시간으로 급여가 자동 산정됩니다. 마지막에 본인 확인을 눌러주세요."
        accent="text-info"
      />

      <Card>
        <CardContent className="pt-4">
          <MyWorkHoursPanel initial={sheet} year={year} month={month} />
        </CardContent>
      </Card>
    </div>
  );
}
