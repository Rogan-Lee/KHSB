import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [
    studentCounts,
    attendanceWeek,
    mentoringWeek,
    messagesWeek,
    featureRequests,
    newStudents,
    parentReports,
    consultations,
  ] = await Promise.all([
    prisma.student.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.attendanceRecord.aggregate({
      where: { date: { gte: weekAgo } },
      _count: { id: true, checkIn: true, checkOut: true },
    }),
    prisma.mentoring.groupBy({
      by: ["status"],
      where: { scheduledAt: { gte: weekAgo } },
      _count: true,
    }),
    prisma.messageLog.groupBy({
      by: ["type", "status"],
      where: { sentAt: { gte: weekAgo } },
      _count: { _all: true },
    }),
    prisma.featureRequest.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.student.count({
      where: { createdAt: { gte: weekAgo } },
    }),
    prisma.parentReport.count({
      where: { createdAt: { gte: weekAgo } },
    }),
    prisma.directorConsultation.groupBy({
      by: ["status"],
      where: { createdAt: { gte: weekAgo } },
      _count: true,
    }),
  ]);

  const students = {
    total: studentCounts.reduce((sum, g) => sum + g._count, 0),
    active: studentCounts.find((g) => g.status === "ACTIVE")?._count ?? 0,
  };

  const attendance = {
    weekTotal: attendanceWeek._count.id,
    checkedIn: attendanceWeek._count.checkIn,
    checkedOut: attendanceWeek._count.checkOut,
  };

  const mentoring: Record<string, number> = {};
  for (const g of mentoringWeek) {
    mentoring[g.status] = g._count;
  }

  const messages = messagesWeek.map((g) => ({
    type: g.type,
    status: g.status,
    count: g._count._all,
  }));

  const features: Record<string, number> = {};
  for (const g of featureRequests) {
    features[g.status] = g._count;
  }

  const consultationsByStatus: Record<string, number> = {};
  for (const g of consultations) {
    consultationsByStatus[g.status] = g._count;
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    period: { from: weekAgo.toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
    students,
    newStudents,
    attendance,
    mentoring,
    messages,
    featureRequests: features,
    parentReports,
    consultations: consultationsByStatus,
  });
}
