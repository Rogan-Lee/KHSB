"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireFullAccess } from "@/lib/roles";
import { validateMagicLink, issueMagicLink } from "@/lib/student-auth";
import { notifySlack } from "@/lib/slack";
import { todayKST } from "@/lib/utils";

// ─────────────────────────── 학부모 (매직링크 토큰 인증) ───────────────────────────

/**
 * 학생의 미결제 주문을 선택한 메뉴 목록으로 통째로 교체(신청/수정/취소).
 * - 이미 결제완료된 날짜는 중복 결제 방지를 위해 무시
 * - 선택이 비면 미결제 주문을 삭제(전체 취소)
 * - 가격은 주문 시점 스냅샷으로 저장(이후 메뉴 가격 변경에도 총액 불변)
 */
export async function submitLunchOrder(input: {
  token: string;
  menuIds: string[];
  memo?: string;
}) {
  const session = await validateMagicLink(input.token);
  if (!session) throw new Error("인증이 만료되었습니다");
  const studentId = session.student.id;
  const memo = input.memo?.trim() || null;

  const today = todayKST();
  const menus = await prisma.lunchMenu.findMany({
    where: { id: { in: input.menuIds }, closed: false, date: { gte: today } },
  });

  // 이미 결제완료된 주문에 포함된 날짜는 제외
  const paidItems = await prisma.lunchOrderItem.findMany({
    where: { order: { studentId, paidStatus: "PAID" } },
    select: { menuId: true },
  });
  const paidMenuIds = new Set(paidItems.map((i) => i.menuId));
  const finalMenus = menus.filter((m) => !paidMenuIds.has(m.id));

  const pending = await prisma.lunchOrder.findFirst({
    where: { studentId, paidStatus: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  if (finalMenus.length === 0) {
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

  // 미결제 주문이라 항목 전체 교체가 안전
  await prisma.lunchOrderItem.deleteMany({ where: { orderId: order.id } });
  await prisma.lunchOrderItem.createMany({
    data: finalMenus.map((m) => ({ orderId: order.id, menuId: m.id, price: m.price })),
  });

  revalidatePath("/lunch");
  return { count: finalMenus.length };
}

/** 학부모가 "입금했어요" 알림 — 미결제 주문에 표식. 관리자는 이후 실제 확인. */
export async function claimLunchDeposit(token: string) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");
  const order = await prisma.lunchOrder.findFirst({
    where: { studentId: session.student.id, paidStatus: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (!order) throw new Error("신청 내역을 찾을 수 없습니다");
  await prisma.lunchOrder.update({
    where: { id: order.id },
    data: { depositClaimedAt: new Date() },
  });
  notifySlack(
    `💰 [도시락 입금알림] ${session.student.name} 학부모가 입금 완료를 알렸습니다. 확인 후 처리해 주세요.`
  );
  revalidatePath("/lunch");
  return { ok: true };
}

/** 학부모의 변경 요청 — 학생별 스레드에 누적. Slack 알림. */
export async function requestLunchChange(token: string, message: string) {
  const session = await validateMagicLink(token);
  if (!session) throw new Error("인증이 만료되었습니다");
  const msg = message.trim();
  if (!msg) throw new Error("변경 요청 내용을 입력해 주세요");
  await prisma.lunchChangeRequest.create({
    data: { studentId: session.student.id, message: msg.slice(0, 1000) },
  });
  notifySlack(`✏️ [도시락 변경요청] ${session.student.name}: ${msg.slice(0, 300)}`);
  revalidatePath("/lunch");
  return { ok: true };
}

// ─────────────────────────── 관리자 (requireStaff) ───────────────────────────

export async function createLunchMenu(input: {
  date: string;
  name: string;
  price: number;
  buffer?: number;
}) {
  const s = await auth();
  requireStaff(s?.user?.role);
  const name = input.name.trim();
  if (!name) throw new Error("메뉴명을 입력해 주세요");
  if (!Number.isFinite(input.price) || input.price < 0) throw new Error("가격이 올바르지 않습니다");
  if (input.buffer !== undefined && (input.buffer < 0 || !Number.isFinite(input.buffer)))
    throw new Error("여유분이 올바르지 않습니다");
  const buffer = Math.round(input.buffer ?? 0);
  const date = new Date(input.date); // "YYYY-MM-DD" → UTC 자정
  if (Number.isNaN(date.getTime())) throw new Error("날짜가 올바르지 않습니다");

  // 하루 1메뉴 — 같은 날짜면 덮어씀
  await prisma.lunchMenu.upsert({
    where: { date },
    update: { name, price: Math.round(input.price), buffer },
    create: { date, name, price: Math.round(input.price), buffer, createdById: s!.user.id },
  });
  revalidatePath("/lunch");
}

export async function updateLunchMenu(input: {
  id: string;
  name?: string;
  price?: number;
  buffer?: number;
  closed?: boolean;
}) {
  const s = await auth();
  requireStaff(s?.user?.role);
  if (input.price !== undefined && (input.price < 0 || !Number.isFinite(input.price)))
    throw new Error("가격이 올바르지 않습니다");
  if (input.buffer !== undefined && (input.buffer < 0 || !Number.isFinite(input.buffer)))
    throw new Error("여유분이 올바르지 않습니다");
  const name = input.name?.trim();
  if (input.name !== undefined && !name) throw new Error("메뉴명을 입력해 주세요");

  await prisma.lunchMenu.update({
    where: { id: input.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(input.price !== undefined ? { price: Math.round(input.price) } : {}),
      ...(input.buffer !== undefined ? { buffer: Math.round(input.buffer) } : {}),
      ...(input.closed !== undefined ? { closed: input.closed } : {}),
    },
  });
  revalidatePath("/lunch");
}

export async function deleteLunchMenu(id: string) {
  const s = await auth();
  requireStaff(s?.user?.role);
  const count = await prisma.lunchOrderItem.count({ where: { menuId: id } });
  if (count > 0) throw new Error("이미 신청된 메뉴는 삭제할 수 없습니다. 마감 처리하세요.");
  await prisma.lunchMenu.delete({ where: { id } });
  revalidatePath("/lunch");
}

/** 입금 확인 일괄 처리 — 미결제 주문만 결제완료로 전환 */
export async function bulkConfirmPayment(orderIds: string[]) {
  const s = await auth();
  requireStaff(s?.user?.role);
  const res = await prisma.lunchOrder.updateMany({
    where: { id: { in: orderIds }, paidStatus: "PENDING" },
    data: { paidStatus: "PAID", paidAt: new Date(), paidById: s!.user.id },
  });
  revalidatePath("/lunch");
  return { count: res.count };
}

/** 신청 삭제(취소) — 주문과 항목(cascade) 전체 제거. 입금 여부 무관, 관리자 재량. */
export async function deleteLunchOrder(orderId: string) {
  const s = await auth();
  requireStaff(s?.user?.role);
  await prisma.lunchOrder.delete({ where: { id: orderId } });
  revalidatePath("/lunch");
}

/** 입금 확인 취소(오확인 되돌리기) */
export async function revertPayment(orderId: string) {
  const s = await auth();
  requireStaff(s?.user?.role);
  await prisma.lunchOrder.update({
    where: { id: orderId },
    data: { paidStatus: "PENDING", paidAt: null, paidById: null },
  });
  revalidatePath("/lunch");
}

/** 변경 요청에 대한 운영자 답변(= 반영 내용). 학부모가 확인 가능. */
export async function replyLunchChangeRequest(id: string, reply: string) {
  const s = await auth();
  requireStaff(s?.user?.role);
  const r = reply.trim();
  if (!r) throw new Error("반영 내용을 입력해 주세요");
  await prisma.lunchChangeRequest.update({
    where: { id },
    data: { reply: r.slice(0, 1000), repliedByName: s!.user.name, repliedAt: new Date() },
  });
  revalidatePath("/lunch");
}

/** 배부 체크 토글 */
export async function setItemReceived(itemId: string, received: boolean) {
  const s = await auth();
  requireStaff(s?.user?.role);
  await prisma.lunchOrderItem.update({
    where: { id: itemId },
    data: { received, receivedAt: received ? new Date() : null },
  });
  revalidatePath("/lunch");
}

/**
 * 선택 학생들의 학부모 포털 링크(`/s/[token]`)를 일괄 확보.
 * 이미 활성 링크가 있으면 재사용, 없으면 신규 발급. 발급은 원장/SA만.
 */
export async function issueLunchParentLinks(studentIds: string[]) {
  const s = await auth();
  requireFullAccess(s?.user?.role);
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: {
      id: true,
      name: true,
      grade: true,
      magicLinks: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { issuedAt: "desc" },
        take: 1,
        select: { token: true },
      },
    },
  });
  const out: { studentId: string; name: string; grade: string; token: string }[] = [];
  for (const st of students) {
    let token = st.magicLinks[0]?.token;
    if (!token) {
      const link = await issueMagicLink({ studentId: st.id, issuedById: s!.user.id });
      token = link.token;
    }
    out.push({ studentId: st.id, name: st.name, grade: st.grade, token });
  }
  revalidatePath("/lunch");
  return out;
}

export async function updateLunchSetting(input: { bankInfo?: string; guideText?: string }) {
  const s = await auth();
  requireStaff(s?.user?.role);
  const bankInfo = input.bankInfo?.trim() || null;
  const guideText = input.guideText?.trim() || null;
  await prisma.lunchSetting.upsert({
    where: { id: "default" },
    update: { bankInfo, guideText },
    create: { id: "default", bankInfo, guideText },
  });
  revalidatePath("/lunch");
}
