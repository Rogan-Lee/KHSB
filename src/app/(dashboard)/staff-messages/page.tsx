import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/backoffice/ui";
import { StaffDmPanel } from "@/components/messages/staff-dm-panel";
import { requireDashboardSession } from "../_lib/page-guard";

// 데스크톱에서 대화 목록·대화창이 화면 높이에 맞춰 안에서만 스크롤되도록 한다.
// 셸 상단 바(56) + main 위·아래 여백(32·64) + 페이지 머리(~100) ≈ 252px.
const PANEL_FRAME =
  "overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default lg:h-[calc(100dvh-256px)] lg:min-h-[480px]";

export default async function StaffMessagesPage() {
  const { user } = await requireDashboardSession();
  const staff = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: { not: "STUDENT" },
      id: { not: user.id },
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title="직원 메시지" description="직원끼리 1:1로 주고받는 메시지예요. 새 메시지는 앱 알림으로도 받아요." />
      <div className={PANEL_FRAME}>
        <StaffDmPanel staff={staff} />
      </div>
    </div>
  );
}
