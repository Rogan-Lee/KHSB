import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isStaff, isFullAccess } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { currentYearMonthKST } from "@/lib/online/month";
import { LunchAdmin } from "./_components/lunch-admin";

export const dynamic = "force-dynamic";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function LunchAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (!isStaff(session.user.role)) redirect("/");

  const { ym: ymParam } = await searchParams;
  const ym = /^\d{4}-\d{2}$/.test(ymParam ?? "") ? ymParam! : currentYearMonthKST();

  const [menus, orders, changeRequests, students, setting] = await Promise.all([
    prisma.lunchMenu.findMany({ orderBy: { date: "asc" } }),
    prisma.lunchOrder.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        student: { select: { id: true, name: true, grade: true, parentPhone: true } },
        items: { include: { menu: { select: { id: true, date: true, name: true } } } },
      },
    }),
    prisma.lunchChangeRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: { student: { select: { name: true, grade: true } } },
    }),
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        grade: true,
        parentPhone: true,
        magicLinks: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { issuedAt: "desc" },
          take: 1,
          select: { token: true },
        },
      },
    }),
    prisma.lunchSetting.findUnique({ where: { id: "default" } }),
  ]);

  return (
    <LunchAdmin
      ym={ym}
      canIssueLinks={isFullAccess(session.user.role)}
      menus={menus.map((m) => ({
        id: m.id,
        date: ymd(m.date),
        name: m.name,
        price: m.price,
        buffer: m.buffer,
        closed: m.closed,
      }))}
      orders={orders.map((o) => ({
        id: o.id,
        studentId: o.student.id,
        studentName: o.student.name,
        grade: o.student.grade,
        parentPhone: o.student.parentPhone,
        paidStatus: o.paidStatus,
        memo: o.memo,
        depositClaimed: !!o.depositClaimedAt,
        items: o.items.map((i) => ({
          id: i.id,
          menuId: i.menuId,
          date: ymd(i.menu.date),
          name: i.menu.name,
          price: i.price,
          received: i.received,
        })),
      }))}
      students={students.map((s) => ({
        id: s.id,
        name: s.name,
        grade: s.grade,
        parentPhone: s.parentPhone,
        token: s.magicLinks[0]?.token ?? null,
      }))}
      changeRequests={changeRequests.map((c) => ({
        id: c.id,
        studentName: c.student.name,
        grade: c.student.grade,
        message: c.message,
        reply: c.reply,
        repliedByName: c.repliedByName,
        createdAt: c.createdAt.toISOString(),
        repliedAt: c.repliedAt?.toISOString() ?? null,
      }))}
      bankInfo={setting?.bankInfo ?? ""}
      guideText={setting?.guideText ?? ""}
    />
  );
}
