import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isFullAccess } from "@/lib/roles";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KakaoMessagePanel } from "@/components/messages/kakao-message-panel";
import { StaffDmPanel } from "@/components/messages/staff-dm-panel";
import { BroadcastPushPanel } from "@/components/messages/broadcast-push-panel";

export default async function MessagesPage() {
  const user = await getUser();
  const [students, templates, staff] = await Promise.all([
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true, parentPhone: true },
      orderBy: { name: "asc" },
    }),
    prisma.messageTemplate.findMany({
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        role: { not: "STUDENT" },
        ...(user ? { id: { not: user.id } } : {}),
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const canBroadcast = isFullAccess(user?.role);

  return (
    <Tabs defaultValue="kakao" className="flex h-[calc(100vh-104px)] flex-col">
      <TabsList className="w-fit shrink-0">
        <TabsTrigger value="kakao">카카오 메시지</TabsTrigger>
        <TabsTrigger value="staff-dm">직원 메시지</TabsTrigger>
        {canBroadcast && <TabsTrigger value="broadcast">단체 알림</TabsTrigger>}
      </TabsList>
      <TabsContent value="kakao" className="min-h-0 flex-1">
        <Card className="h-full overflow-hidden">
          <CardContent className="h-full p-0">
            <KakaoMessagePanel initialTemplates={templates} students={students} />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="staff-dm" className="min-h-0 flex-1">
        <Card className="h-full overflow-hidden">
          <CardContent className="h-full p-0">
            <StaffDmPanel staff={staff} />
          </CardContent>
        </Card>
      </TabsContent>
      {canBroadcast && (
        <TabsContent value="broadcast" className="min-h-0 flex-1 overflow-y-auto">
          <Card>
            <CardContent className="p-0">
              <BroadcastPushPanel />
            </CardContent>
          </Card>
        </TabsContent>
      )}
    </Tabs>
  );
}
