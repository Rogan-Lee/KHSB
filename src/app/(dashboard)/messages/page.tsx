import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/backoffice/ui";
import { KakaoMessagePanel } from "@/components/messages/kakao-message-panel";
import { BroadcastPushPanel } from "@/components/messages/broadcast-push-panel";

// 데스크톱에서 대화·템플릿 패널이 화면 높이에 맞춰 안에서만 스크롤되도록 한다.
// 셸 상단 바(56) + main 위·아래 여백(32·64) + 페이지 머리(~95) + 탭(44) + 탭 간격(20) ≈ 312px.
// 직원 메시지(DM)는 /staff-messages 로 분리했다.
const PANEL_FRAME =
  "overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default lg:h-[calc(100dvh-320px)] lg:min-h-[480px]";

export default async function MessagesPage() {
  const user = await getUser();
  const [students, templates] = await Promise.all([
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true, parentPhone: true },
      orderBy: { name: "asc" },
    }),
    prisma.messageTemplate.findMany({
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const canBroadcast = isFullAccess(user?.role);

  const kakao = (
    <div className={PANEL_FRAME}>
      <KakaoMessagePanel initialTemplates={templates} students={students} />
    </div>
  );

  return (
    <div>
      <PageHeader
        title="카카오 메시지"
        description={
          canBroadcast
            ? "학부모에게 보낼 카톡 문구를 만들고, 앱 단체 알림도 여기서 보내요."
            : "학부모에게 보낼 카톡 문구를 템플릿으로 만들어 두고 바로 보내요."
        }
      />
      {canBroadcast ? (
        <Tabs defaultValue="kakao">
          <TabsList>
            <TabsTrigger value="kakao">카카오 메시지</TabsTrigger>
            <TabsTrigger value="broadcast">단체 알림</TabsTrigger>
          </TabsList>
          <TabsContent value="kakao">{kakao}</TabsContent>
          <TabsContent value="broadcast">
            <BroadcastPushPanel />
          </TabsContent>
        </Tabs>
      ) : (
        kakao
      )}
    </div>
  );
}
