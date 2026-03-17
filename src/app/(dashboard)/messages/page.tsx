import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { KakaoMessagePanel } from "@/components/messages/kakao-message-panel";

export default async function MessagesPage() {
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

  return (
    <Card className="overflow-hidden h-[calc(100vh-104px)]">
      <CardContent className="p-0 h-full">
        <KakaoMessagePanel initialTemplates={templates} students={students} />
      </CardContent>
    </Card>
  );
}
