import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type LunchOrderLine = { date: string; name: string; price: number };

export type LunchOrderState = {
  total: number;
  items: LunchOrderLine[];
  depositClaimed: boolean; // 학부모가 "입금했어요" 알림함 (미결제 주문)
};

export type LunchChangeThread = {
  id: string;
  message: string;
  reply: string | null;
  repliedByName: string | null;
  createdAt: string;
  repliedAt: string | null;
};

export type LunchFormProps = {
  token: string;
  menus: { id: string; date: string; name: string; price: number }[];
  pendingMenuIds: string[];
  pendingMemo: string;
  paidMenuIds: string[];
  pending: LunchOrderState | null; // 입금 대기 중인 주문
  confirmed: LunchOrderState | null; // 입금 확인 완료된 최신 주문
  changeRequests: LunchChangeThread[]; // 변경 요청 ↔ 답변 스레드 (최신순)
  bankInfo: string | null;
  guideText: string | null;
};

export type LunchFormData = {
  studentName: string;
  form: LunchFormProps;
};

/**
 * 매직링크 토큰으로 학생을 식별하고 도시락 신청 폼에 필요한 데이터를 로드.
 * 학생 포털(`/s/[token]/lunch`)과 학부모 전용(`/meal/[token]`) 양쪽에서 공용.
 * 토큰이 유효하지 않으면 null.
 */
export async function loadLunchFormData(token: string): Promise<LunchFormData | null> {
  const session = await validateMagicLink(token);
  if (!session) return null;
  const studentId = session.student.id;
  const today = todayKST();

  const [menus, orders, changeRequests, setting] = await Promise.all([
    prisma.lunchMenu.findMany({
      where: { date: { gte: today }, closed: false },
      orderBy: { date: "asc" },
    }),
    prisma.lunchOrder.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { menu: true } } },
    }),
    prisma.lunchChangeRequest.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.lunchSetting.findUnique({ where: { id: "default" } }),
  ]);

  const pendingOrder = orders.find((o) => o.paidStatus === "PENDING") ?? null;
  const confirmedOrder = orders.find((o) => o.paidStatus === "PAID") ?? null;
  const paidItems = orders
    .filter((o) => o.paidStatus === "PAID")
    .flatMap((o) => o.items);
  const paidMenuIds = new Set(paidItems.map((i) => i.menuId));

  const toState = (o: (typeof orders)[number]): LunchOrderState => {
    const items = o.items
      .map((i) => ({ date: ymd(i.menu.date), name: i.menu.name, price: i.price }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      total: items.reduce((s, it) => s + it.price, 0),
      items,
      depositClaimed: !!o.depositClaimedAt,
    };
  };

  return {
    studentName: session.student.name,
    form: {
      token,
      menus: menus.map((m) => ({ id: m.id, date: ymd(m.date), name: m.name, price: m.price })),
      pendingMenuIds: pendingOrder ? pendingOrder.items.map((i) => i.menuId) : [],
      pendingMemo: pendingOrder?.memo ?? "",
      paidMenuIds: [...paidMenuIds],
      pending: pendingOrder ? toState(pendingOrder) : null,
      confirmed: confirmedOrder ? toState(confirmedOrder) : null,
      changeRequests: changeRequests.map((c) => ({
        id: c.id,
        message: c.message,
        reply: c.reply,
        repliedByName: c.repliedByName,
        createdAt: c.createdAt.toISOString(),
        repliedAt: c.repliedAt?.toISOString() ?? null,
      })),
      bankInfo: setting?.bankInfo ?? null,
      guideText: setting?.guideText ?? null,
    },
  };
}
