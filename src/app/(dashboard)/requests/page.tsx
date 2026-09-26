export const revalidate = 30;

import Link from "next/link";
import { Plus } from "lucide-react";
import {
  getFeatureRequests,
  markAllOpenFeatureRequestsSeen,
} from "@/actions/feature-requests";
import { FeatureRequestBoard } from "@/components/feature-requests/feature-request-board";
import { PageHeader } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { requireDashboardSession } from "../_lib/page-guard";

export default async function RequestsPage() {
  await requireDashboardSession();

  // 페이지 진입 시 본인이 보지 않은 PENDING/IN_PROGRESS 건의를 모두 seen 처리
  // → 사이드바 unseen 배지가 자동으로 사라짐
  await markAllOpenFeatureRequestsSeen().catch(() => {
    /* 본 페이지 렌더링은 막지 않음 */
  });

  const requests = await getFeatureRequests();

  return (
    <>
      <PageHeader
        title="요청사항"
        description="기능 요청·버그·개선 사항을 등록하고 진행 상태를 관리해요."
        actions={
          <Button asChild>
            <Link href="/requests/new">
              <Plus aria-hidden />
              요청 등록
            </Link>
          </Button>
        }
      />
      <FeatureRequestBoard requests={requests} />
    </>
  );
}
