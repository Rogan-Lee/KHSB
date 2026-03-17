import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/utils";
import { MessageSendPanel } from "@/components/messages/message-send-panel";
import { KakaoMessagePanel } from "@/components/messages/kakao-message-panel";
import { MessageCircle, CheckCircle2, XCircle } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  ATTENDANCE: "출석 알림",
  ABSENT: "결석 알림",
  MERIT_DEMERIT: "상벌점 알림",
  MENTORING: "멘토링 알림",
  MONTHLY_REPORT: "월간 리포트",
  CONSULTATION: "면담 알림",
  CUSTOM: "개별 발송",
};

export default async function MessagesPage() {
  const session = await auth();

  const [students, logs, currentUser] = await Promise.all([
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true, parentPhone: true },
      orderBy: { name: "asc" },
    }),
    prisma.messageLog.findMany({
      include: { student: { select: { name: true } } },
      orderBy: { sentAt: "desc" },
      take: 100,
    }),
    session?.user?.id
      ? prisma.user.findUnique({
          where: { id: session.user.id },
          select: { kakaoAccessToken: true },
        })
      : null,
  ]);

  const sent = logs.filter((l) => l.status === "SENT").length;
  const failed = logs.filter((l) => l.status === "FAILED").length;
  const kakaoConnected = !!currentUser?.kakaoAccessToken;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <MessageCircle className="h-8 w-8 text-blue-600" />
            <div>
              <p className="text-2xl font-bold">{logs.length}</p>
              <p className="text-sm text-muted-foreground">총 발송</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold">{sent}</p>
              <p className="text-sm text-muted-foreground">발송 성공</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <XCircle className="h-8 w-8 text-red-600" />
            <div>
              <p className="text-2xl font-bold">{failed}</p>
              <p className="text-sm text-muted-foreground">발송 실패</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* 발송 패널 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>메시지 발송</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="kakao">
              <TabsList className="mb-4 w-full">
                <TabsTrigger value="kakao" className="flex-1 gap-1.5">
                  <span className="text-yellow-500">●</span>
                  카카오톡
                  {kakaoConnected && (
                    <span className="ml-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">연결됨</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="bulk" className="flex-1">
                  원생 일괄 발송
                </TabsTrigger>
              </TabsList>

              <TabsContent value="kakao">
                <KakaoMessagePanel initialConnected={kakaoConnected} />
              </TabsContent>

              <TabsContent value="bulk">
                <MessageSendPanel students={students} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* 발송 이력 */}
        <Card>
          <CardHeader>
            <CardTitle>발송 이력</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>발송일시</TableHead>
                  <TableHead>원생</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      발송 이력이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.slice(0, 20).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">{formatDateTime(log.sentAt)}</TableCell>
                      <TableCell>{log.student.name}</TableCell>
                      <TableCell className="text-xs">{TYPE_LABELS[log.type]}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            log.status === "SENT" ? "default"
                              : log.status === "FAILED" ? "destructive"
                              : "secondary"
                          }
                        >
                          {log.status === "SENT" ? "성공" : log.status === "FAILED" ? "실패" : "대기"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
