import { revalidatePath } from "next/cache";

import { isLunchLocked } from "@/lib/lunch-lock";
import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import { todayKST } from "@/lib/utils";

// 도시락 신청(학부모/학생 측) 핵심 로직 — 학생 ID 기준.
// 인증은 호출 측 책임: 웹 서버 액션(src/actions/lunch.ts, 매직링크 토큰)과
// 학부모 앱 라우트(src/lib/mobile-parent-lunch.ts, ParentLink)가 같이 쓴다.
// 오류는 MobileApiError(Error 하위 클래스, 한국어 메시지 + HTTP 상태)로 던진다.

type LunchStudent = { id: string; name: string };

const MAX_MEMO_LEN = 300; // 신청 폼 textarea maxLength 와 동일
const MAX_MENU_IDS = 100;

/**
 * 학생의 미결제 주문을 선택한 메뉴 목록으로 통째로 교체(신청/수정/취소).
 * - 이미 결제완료된 날짜는 중복 결제 방지를 위해 무시
 * - 선택이 비면 미결제 주문을 삭제(전체 취소)
 * - 가격은 주문 시점 스냅샷으로 저장(이후 메뉴 가격 변경에도 총액 불변)
 */
export async function submitLunchOrderForStudent(
  studentId: string,
  input: { menuIds: string[]; memo?: string },
) {
  const memo = (typeof input.memo === "string" ? input.memo : "").trim().slice(0, MAX_MEMO_LEN) || null;
  const menuIds = Array.isArray(input.menuIds)
    ? input.menuIds.filter((id): id is string => typeof id === "string").slice(0, MAX_MENU_IDS)
    : [];

  const today = todayKST();
  const now = new Date();
  const menus = await prisma.lunchMenu.findMany({
    where: { id: { in: menuIds }, closed: false, date: { gte: today } },
  });

  // 이미 결제완료된 주문에 포함된 날짜는 제외
  const paidItems = await prisma.lunchOrderItem.findMany({
    where: { order: { studentId, paidStatus: "PAID" } },
    select: { menuId: true },
  });
  const paidMenuIds = new Set(paidItems.map((i) => i.menuId));

  const pending = await prisma.lunchOrder.findFirst({
    where: { studentId, paidStatus: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: { items: { include: { menu: { select: { date: true } } } } },
  });

  // 이미 신청된 항목 중 마감(잠긴)된 주의 날짜는 변경 불가 → 그대로 보존
  const lockedKeep = (pending?.items ?? []).filter((i) => isLunchLocked(i.menu.date, now));
  const lockedMenuIds = new Set(lockedKeep.map((i) => i.menuId));

  // 새로 선택한 메뉴는 미결제·마감 전 날짜만 반영 (결제완료·보존항목과 중복 제거)
  const finalMenus = menus.filter(
    (m) => !paidMenuIds.has(m.id) && !lockedMenuIds.has(m.id) && !isLunchLocked(m.date, now),
  );

  if (finalMenus.length === 0 && lockedKeep.length === 0) {
    if (pending) await prisma.lunchOrder.delete({ where: { id: pending.id } });
    revalidatePath("/lunch");
    return { count: 0 };
  }

  const order = pending
    ? // 수정 시 이전 "입금했어요" 알림은 무효화(내용이 바뀌었으므로 재확인 필요)
      await prisma.lunchOrder.update({
        where: { id: pending.id },
        data: { memo, depositClaimedAt: null },
      })
    : await prisma.lunchOrder.create({ data: { studentId, memo } });

  // 미결제 주문이라 항목 전체 교체가 안전 (단, 잠긴 항목은 스냅샷 가격으로 재생성해 보존)
  await prisma.lunchOrderItem.deleteMany({ where: { orderId: order.id } });
  await prisma.lunchOrderItem.createMany({
    data: [
      ...lockedKeep.map((i) => ({ orderId: order.id, menuId: i.menuId, price: i.price })),
      ...finalMenus.map((m) => ({ orderId: order.id, menuId: m.id, price: m.price })),
    ],
  });

  revalidatePath("/lunch");
  return { count: finalMenus.length + lockedKeep.length };
}

/**
 * "입금했어요" 알림 — 미결제 주문에 표식. 관리자는 이후 실제 확인.
 * via: Slack 문구 끝에 붙는 경로 표시 (예: " (학부모 앱)"). 웹은 생략 → 기존 문구 그대로.
 */
export async function claimLunchDepositForStudent(student: LunchStudent, via = "") {
  const order = await prisma.lunchOrder.findFirst({
    where: { studentId: student.id, paidStatus: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (!order) throw new MobileApiError("신청 내역을 찾을 수 없습니다", 404);
  await prisma.lunchOrder.update({
    where: { id: order.id },
    data: { depositClaimedAt: new Date() },
  });
  notifySlack(
    `💰 [도시락 입금알림] ${student.name} 학부모가 입금 완료를 알렸습니다. 확인 후 처리해 주세요.${via}`,
  );
  revalidatePath("/lunch");
  return { ok: true };
}

/** 변경 요청 — 학생별 스레드에 누적. Slack 알림. */
export async function requestLunchChangeForStudent(
  student: LunchStudent,
  message: string,
  via = "",
) {
  const msg = (typeof message === "string" ? message : "").trim();
  if (!msg) throw new MobileApiError("변경 요청 내용을 입력해 주세요", 400);
  await prisma.lunchChangeRequest.create({
    data: { studentId: student.id, message: msg.slice(0, 1000) },
  });
  notifySlack(`✏️ [도시락 변경요청] ${student.name}: ${msg.slice(0, 300)}${via}`);
  revalidatePath("/lunch");
  return { ok: true };
}
