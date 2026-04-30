import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import { todayKST } from "@/lib/utils";

// 매일 KST 08:00 실행 (vercel.json: "0 23 * * *" = UTC 23:00 = KST 08:00 익일).
// 온라인 수행평가 D-3 / D-1 / D-Day 항목을 학생별로 묶어 Slack 으로 알림.
// 카카오 친구 메시지는 친구 UUID 연결된 학생만 가능 → Phase 1 은 Slack 만.
export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  const today = todayKST();
  const buckets = [
    { label: "D-Day", offset: 0 },
    { label: "D-1", offset: 1 },
    { label: "D-3", offset: 3 },
  ];

  type Row = {
    studentName: string;
    grade: string;
    subject: string;
    title: string;
    consultantName: string | null;
  };

  const sectionLines: string[] = [];
  let totalCount = 0;

  for (const bucket of buckets) {
    const target = new Date(today);
    target.setDate(target.getDate() + bucket.offset);

    const tasks = await prisma.performanceTask.findMany({
      where: {
        dueDate: target,
        status: { in: ["OPEN", "IN_PROGRESS", "SUBMITTED", "NEEDS_REVISION"] },
        student: { isOnlineManaged: true, status: "ACTIVE" },
      },
      include: {
        student: {
          select: {
            name: true,
            grade: true,
            assignedConsultant: { select: { name: true } },
          },
        },
      },
      orderBy: [{ student: { name: "asc" } }, { subject: "asc" }],
    });

    if (tasks.length === 0) continue;

    sectionLines.push(`*${bucket.label}* (${tasks.length}건)`);
    for (const t of tasks) {
      const row: Row = {
        studentName: t.student.name,
        grade: t.student.grade,
        subject: t.subject,
        title: t.title,
        consultantName: t.student.assignedConsultant?.name ?? null,
      };
      sectionLines.push(
        `• ${row.studentName} (${row.grade}) — ${row.subject}: ${row.title}` +
          (row.consultantName ? ` _(컨설턴트: ${row.consultantName})_` : "")
      );
      totalCount++;
    }
    sectionLines.push("");
  }

  if (totalCount === 0) {
    return NextResponse.json({ ok: true, count: 0, message: "오늘 알림 대상 없음" });
  }

  const message = [
    `📋 *온라인 수행평가 마감 알림* — ${today.toLocaleDateString("ko-KR")}`,
    "",
    ...sectionLines,
    `_/online/performance 에서 전체 보기_`,
  ].join("\n");

  await notifySlack(message);

  return NextResponse.json({ ok: true, count: totalCount });
}
