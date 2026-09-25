import { z } from "zod";

import type { User } from "@/generated/prisma";
import { MobileApiError } from "@/lib/mobile-auth";
import { getKstDayContext } from "@/lib/mobile-data";
import { prisma } from "@/lib/prisma";

// 직원 앱 — 점심 도시락 수령(배부) 체크 + 학부모 변경 요청 답변.
// 웹 /lunch 의 "배부"·"변경 요청" 탭과 같은 데이터·규칙 (actions/lunch.ts setItemReceived · replyLunchChangeRequest).

type StaffUser = Pick<User, "id" | "name" | "role">;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new MobileApiError(result.error.issues[0]?.message ?? "입력값을 확인하세요", 400);
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** 좌석 번호 자연 정렬 (A-2 < A-10), 좌석 없는 학생은 뒤로 */
function compareSeat(a: string | null, b: string | null) {
  if (a && !b) return -1;
  if (!a && b) return 1;
  return (a ?? "").localeCompare(b ?? "", "ko", { numeric: true });
}

export async function getMobileStaffLunch(dateParam: string | null) {
  const today = getKstDayContext().dateKey;
  const dateKey = dateParam && DATE_RE.test(dateParam) ? dateParam : today;
  const date = new Date(dateKey); // @db.Date — UTC 자정

  const [menu, prevMenu, nextMenu, requests] = await Promise.all([
    prisma.lunchMenu.findUnique({
      where: { date },
      select: {
        id: true,
        name: true,
        price: true,
        closed: true,
        items: {
          select: {
            id: true,
            received: true,
            receivedAt: true,
            order: {
              select: {
                paidStatus: true,
                depositClaimedAt: true,
                memo: true,
                student: { select: { id: true, name: true, grade: true, seat: true } },
              },
            },
          },
        },
      },
    }),
    prisma.lunchMenu.findFirst({
      where: { date: { lt: date } },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    prisma.lunchMenu.findFirst({
      where: { date: { gt: date } },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    prisma.lunchChangeRequest.findMany({
      where: { student: { status: "ACTIVE" } },
      orderBy: { createdAt: "desc" },
      take: 80,
      select: {
        id: true,
        message: true,
        reply: true,
        repliedByName: true,
        repliedAt: true,
        createdAt: true,
        student: { select: { name: true, grade: true, seat: true } },
      },
    }),
  ]);

  const items = (menu?.items ?? [])
    .map((item) => ({
      id: item.id,
      received: item.received,
      receivedAt: item.receivedAt?.toISOString() ?? null,
      paid: item.order.paidStatus === "PAID",
      depositClaimed: !!item.order.depositClaimedAt,
      memo: item.order.memo,
      studentId: item.order.student.id,
      studentName: item.order.student.name,
      grade: item.order.student.grade,
      seat: item.order.student.seat,
    }))
    .sort(
      (a, b) =>
        compareSeat(a.seat, b.seat) || a.studentName.localeCompare(b.studentName, "ko"),
    );

  // 미처리(답변 없음) 먼저, 그다음 최신순 — 웹 RequestsTab 과 같은 정렬
  const sortedRequests = [...requests].sort((a, b) => {
    const ao = a.reply ? 1 : 0;
    const bo = b.reply ? 1 : 0;
    if (ao !== bo) return ao - bo;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return {
    date: dateKey,
    isToday: dateKey === today,
    prevDate: prevMenu ? ymd(prevMenu.date) : null,
    nextDate: nextMenu ? ymd(nextMenu.date) : null,
    menu: menu ? { id: menu.id, name: menu.name, price: menu.price, closed: menu.closed } : null,
    items,
    summary: {
      total: items.length,
      received: items.filter((i) => i.received).length,
      paid: items.filter((i) => i.paid).length,
      unpaid: items.filter((i) => !i.paid).length,
    },
    requests: sortedRequests.map((r) => ({
      id: r.id,
      message: r.message,
      reply: r.reply,
      repliedByName: r.repliedByName,
      repliedAt: r.repliedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      studentName: r.student.name,
      grade: r.student.grade,
      seat: r.student.seat,
    })),
    openRequests: requests.filter((r) => !r.reply).length,
  };
}

const receivedSchema = z.object({ received: z.boolean() });

export async function setMobileLunchItemReceived(itemId: string, input: unknown) {
  const { received } = parseBody(receivedSchema, input);
  const exists = await prisma.lunchOrderItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!exists) throw new MobileApiError("도시락 신청을 찾을 수 없습니다", 404);
  const item = await prisma.lunchOrderItem.update({
    where: { id: itemId },
    data: { received, receivedAt: received ? new Date() : null },
    select: { id: true, received: true, receivedAt: true },
  });
  return { id: item.id, received: item.received, receivedAt: item.receivedAt?.toISOString() ?? null };
}

const replySchema = z.object({
  reply: z.string().trim().min(1, "반영 내용을 입력해 주세요").max(1000, "1000자 이하로 입력해 주세요"),
});

export async function replyMobileLunchChangeRequest(
  user: StaffUser,
  requestId: string,
  input: unknown,
) {
  const { reply } = parseBody(replySchema, input);
  const exists = await prisma.lunchChangeRequest.findUnique({
    where: { id: requestId },
    select: { id: true },
  });
  if (!exists) throw new MobileApiError("변경 요청을 찾을 수 없습니다", 404);
  const updated = await prisma.lunchChangeRequest.update({
    where: { id: requestId },
    data: { reply, repliedByName: user.name, repliedAt: new Date() },
    select: { id: true, reply: true, repliedByName: true, repliedAt: true },
  });
  return {
    id: updated.id,
    reply: updated.reply,
    repliedByName: updated.repliedByName,
    repliedAt: updated.repliedAt?.toISOString() ?? null,
  };
}
