import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMyClockStatus, getMyPayrollSummary } from "@/actions/payroll";
import { PageIntro } from "@/components/ui/page-intro";
import { Card, CardContent } from "@/components/ui/card";
import { MyPayrollPanel } from "@/components/payroll/my-payroll-panel";

export const dynamic = "force-dynamic";

export default async function MyPayrollPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const [status, summary] = await Promise.all([
    getMyClockStatus(),
    getMyPayrollSummary(3),
  ]);

  return (
    <div className="space-y-4">
      <PageIntro
        tag="PAYROLL · ME"
        title="내 출퇴근 기록"
        description="출근/퇴근 버튼으로 기록을 남기세요. 기록은 수정할 수 없으며, 오류가 있으면 원장님께 문의하세요."
        accent="text-info"
      />

      <Card>
        <CardContent className="pt-4">
          <MyPayrollPanel
            initialStatus={status}
            initialTags={summary.tags}
            records={summary.records}
          />
        </CardContent>
      </Card>
    </div>
  );
}
