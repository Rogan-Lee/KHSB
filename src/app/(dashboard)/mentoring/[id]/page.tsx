import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MentoringRecordForm } from "@/components/mentoring/mentoring-record-form";
import { formatDate, formatDateTime } from "@/lib/utils";

const STATUS_MAP = {
  SCHEDULED: { label: "예정", variant: "secondary" as const },
  COMPLETED: { label: "완료", variant: "default" as const },
  CANCELLED: { label: "취소", variant: "destructive" as const },
  RESCHEDULED: { label: "일정변경", variant: "outline" as const },
};

export default async function MentoringDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mentoring = await prisma.mentoring.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, name: true, grade: true, school: true } },
      mentor: { select: { id: true, name: true } },
    },
  });

  if (!mentoring) notFound();

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold">멘토링 기록</h2>
        <Badge variant={STATUS_MAP[mentoring.status].variant}>
          {STATUS_MAP[mentoring.status].label}
        </Badge>
      </div>

      <Card>
        <CardContent className="pt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">원생</p>
            <p className="font-medium">{mentoring.student.name} ({mentoring.student.grade})</p>
          </div>
          <div>
            <p className="text-muted-foreground">담당 멘토</p>
            <p className="font-medium">{mentoring.mentor.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">예정 일시</p>
            <p className="font-medium">{formatDateTime(mentoring.scheduledAt)}</p>
          </div>
          {mentoring.actualDate && (
            <div>
              <p className="text-muted-foreground">실제 진행일</p>
              <p className="font-medium">{formatDate(mentoring.actualDate)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">멘토링 내용 기록</CardTitle>
        </CardHeader>
        <CardContent>
          <MentoringRecordForm mentoring={mentoring} />
        </CardContent>
      </Card>
    </div>
  );
}
