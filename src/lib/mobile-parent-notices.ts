import type { ParentChildRef } from "@/lib/mobile-parent-services";
import { prisma } from "@/lib/prisma";

// 학부모 앱 — 공지사항.
//  · 학부모 공지: Announcement(page="parent_notice")
//  · 독서실 공지: 월간 리포트에 싣는 운영 공지(page="monthly_notice") 최신 1건 — 이미 학부모에게 나가는 글
//    (학부모 홈 "독서실 공지" 카드와 같은 글)
//  · 이달의 입시 정보: MonthlyAdmissionInfo (자녀 학년 전용 > 전체), 이번 달이 없으면 지난달

function kstYearMonth(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1 };
}

async function admissionFor(year: number, month: number, grade: string) {
  return (
    (await prisma.monthlyAdmissionInfo.findFirst({ where: { year, month, grade } })) ??
    (await prisma.monthlyAdmissionInfo.findFirst({ where: { year, month, grade: null } }))
  );
}

export async function getParentNotices(child: ParentChildRef) {
  const { year, month } = kstYearMonth();
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

  const [parentNotices, monthlyNotice, admission] = await Promise.all([
    prisma.announcement.findMany({
      where: { page: "parent_notice" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, title: true, content: true, createdAt: true, updatedAt: true },
    }),
    prisma.announcement.findFirst({
      where: { page: "monthly_notice" },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, content: true, createdAt: true, updatedAt: true },
    }),
    admissionFor(year, month, child.grade).then(
      (info) => info ?? admissionFor(prev.year, prev.month, child.grade),
    ),
  ]);

  const toItem = (
    a: { id: string; title: string; content: string; createdAt: Date; updatedAt: Date },
    source: "parent" | "operations",
  ) => ({
    id: a.id,
    source,
    title: a.title.trim() || (source === "operations" ? "독서실 공지" : "학부모 공지"),
    content: a.content,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  });

  const notices = [
    ...parentNotices.map((a) => toItem(a, "parent")),
    ...(monthlyNotice ? [toItem(monthlyNotice, "operations")] : []),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    studentName: child.name,
    grade: child.grade,
    admission: admission
      ? {
          year: admission.year,
          month: admission.month,
          forGrade: admission.grade,
          content: admission.content,
          updatedAt: admission.updatedAt.toISOString(),
        }
      : null,
    notices,
  };
}
