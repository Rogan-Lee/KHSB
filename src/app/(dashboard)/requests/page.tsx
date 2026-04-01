import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getFeatureRequests } from "@/actions/feature-requests";
import { FeatureRequestBoard } from "@/components/feature-requests/feature-request-board";

export default async function RequestsPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const requests = await getFeatureRequests();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">요청사항 관리</h1>
        <p className="text-sm text-muted-foreground mt-1">
          기능 요청, 버그 신고, 개선 사항을 등록하고 진행 상태를 관리합니다.
        </p>
      </div>
      <FeatureRequestBoard requests={requests} />
    </div>
  );
}
