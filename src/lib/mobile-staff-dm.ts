// 모바일 직원 DM — 핵심 로직은 src/lib/staff-dm.ts (웹 서버 액션과 공용).
// 여기서는 입력 검증(zod)·상대 직원 확인·역할 라벨만 붙인다.

import { z } from "zod";

import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { ROLE_DISPLAY } from "@/lib/roles";
import {
  getStaffThread,
  listStaffThreads,
  sendStaffThreadMessage,
  STAFF_DM_MAX_LEN,
  type StaffDmActor,
} from "@/lib/staff-dm";

function roleLabel(role: string | null | undefined) {
  return (role && ROLE_DISPLAY[role]) || "직원";
}

/** 대화 상대가 될 수 있는 직원 — 웹 메시지 화면과 같은 기준(학생 제외 활성 계정) */
async function assertDmPartner(meId: string, otherUserId: string) {
  if (otherUserId === meId) throw new MobileApiError("본인과는 대화할 수 없습니다", 400);
  const other = await prisma.user.findFirst({
    where: { id: otherUserId, status: "ACTIVE", role: { not: "STUDENT" } },
    select: { id: true },
  });
  if (!other) throw new MobileApiError("직원을 찾을 수 없습니다", 404);
}

/** DM 목록 + 새 메시지용 직원 목록 */
export async function getMobileStaffDmInbox(meId: string) {
  const [threads, staff] = await Promise.all([
    listStaffThreads(meId),
    prisma.user.findMany({
      where: { status: "ACTIVE", role: { not: "STUDENT" }, id: { not: meId } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    // 열어보기만 하고 대화가 없는 스레드는 목록에서 뺀다
    threads: threads
      .filter((t) => t.lastMessage)
      .map((t) => ({
        id: t.id,
        other: { id: t.other.id, name: t.other.name, roleLabel: roleLabel(t.other.role) },
        lastMessage: t.lastMessage,
        lastMessageAt: t.lastMessageAt,
        unread: t.unread,
      })),
    staff: staff.map((u) => ({ id: u.id, name: u.name, roleLabel: roleLabel(u.role) })),
  };
}

/** 스레드 조회 (없으면 생성) — 상대 메시지 읽음 처리 */
export async function getMobileStaffDmThread(meId: string, otherUserId: string) {
  await assertDmPartner(meId, otherUserId);
  const thread = await getStaffThread(meId, otherUserId);
  return {
    threadId: thread.threadId,
    other: {
      id: thread.other.id,
      name: thread.other.name,
      roleLabel: roleLabel(thread.other.role),
    },
    messages: thread.messages,
  };
}

const messageSchema = z.object({
  content: z
    .string({ message: "내용을 입력해 주세요" })
    .trim()
    .min(1, "내용을 입력해 주세요")
    .max(STAFF_DM_MAX_LEN, `메시지는 ${STAFF_DM_MAX_LEN}자 이하로 작성해 주세요`),
});

export async function sendMobileStaffDm(me: StaffDmActor, otherUserId: string, input: unknown) {
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) {
    throw new MobileApiError(parsed.error.issues[0]?.message ?? "입력값을 확인하세요", 400);
  }
  await assertDmPartner(me.id, otherUserId);
  return sendStaffThreadMessage(me, otherUserId, parsed.data.content);
}
