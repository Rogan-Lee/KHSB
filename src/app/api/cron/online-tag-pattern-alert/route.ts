import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";

// 매주 월요일 KST 09:00 (UTC 00:00 월요일) — 지난 7일간 태그 빈도를 분석.
// 특정 학생 × 태그가 임계값(기본 3회) 이상이면 Slack 알림.
// vercel.json: "0 0 * * 1"
const THRESHOLD = 3;

export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const logs = await prisma.dailyKakaoLog.findMany({
    where: {
      logDate: { gte: start, lte: end },
      student: { isOnlineManaged: true, status: "ACTIVE" },
    },
    select: {
      studentId: true,
      tags: true,
      student: { select: { name: true, grade: true } },
    },
  });

  // { studentId: { name, grade, tags: Record<tag, count> } }
  type StudentCounts = {
    name: string;
    grade: string;
    tags: Record<string, number>;
  };
  const byStudent = new Map<string, StudentCounts>();

  for (const log of logs) {
    let entry = byStudent.get(log.studentId);
    if (!entry) {
      entry = {
        name: log.student.name,
        grade: log.student.grade,
        tags: {},
      };
      byStudent.set(log.studentId, entry);
    }
    for (const tag of log.tags) {
      entry.tags[tag] = (entry.tags[tag] ?? 0) + 1;
    }
  }

  // 임계값 초과 조합 수집
  const alerts: { name: string; grade: string; tag: string; count: number }[] = [];
  for (const [, entry] of byStudent) {
    for (const [tag, count] of Object.entries(entry.tags)) {
      if (count >= THRESHOLD) {
        alerts.push({ name: entry.name, grade: entry.grade, tag, count });
      }
    }
  }

  if (alerts.length === 0) {
    return NextResponse.json({ ok: true, message: "임계값 초과 태그 없음" });
  }

  // Slack 알림
  alerts.sort((a, b) => b.count - a.count);
  const lines = alerts.map(
    (a) => `• ${a.name} (${a.grade}) — *${a.tag}* 태그 ${a.count}회`
  );
  await notifySlack(
    `🔔 *카톡 일일 보고 태그 빈도 알림* (지난 7일)\n` +
      `_${start.toLocaleDateString("ko-KR")} ~ ${end.toLocaleDateString("ko-KR")} · 임계값 ${THRESHOLD}회_\n\n` +
      lines.join("\n") +
      `\n\n_관리 멘토 확인 필요: /online/daily-log_`
  );

  return NextResponse.json({ ok: true, count: alerts.length, threshold: THRESHOLD });
}
