"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  getFamilyMembers,
  getFamilyThread,
  listFamilyChatsForStaff,
  sendFamilyMessage,
} from "@/lib/family-chat";
import { isAnyStaff } from "@/lib/roles";

// 웹 운영진 화면(소통 › 가족 톡방) — 직원 전체가 모든 재원생 방에 들어갈 수 있다 (원장 결정 2026-11-13).

async function requireStaffViewer() {
  const session = await auth();
  if (!session?.user?.id || !isAnyStaff(session.user.role)) throw new Error("권한이 없습니다");
  return { kind: "STAFF" as const, id: session.user.id };
}

export async function listFamilyChats() {
  const viewer = await requireStaffViewer();
  return listFamilyChatsForStaff(viewer.id);
}

/** 대화 + 멤버. after(ISO) 를 주면 그 뒤 메시지만 (열린 화면의 증분 폴링) */
export async function getFamilyChat(params: { studentId: string; before?: string; after?: string }) {
  const viewer = await requireStaffViewer();
  const [thread, members] = await Promise.all([
    getFamilyThread(params.studentId, viewer, { before: params.before, after: params.after }),
    params.after ? Promise.resolve(null) : getFamilyMembers(params.studentId),
  ]);
  return { ...thread, members };
}

export async function sendFamilyChatMessage(params: {
  studentId: string;
  content: string;
  attachments?: unknown;
}) {
  const viewer = await requireStaffViewer();
  await sendFamilyMessage(params.studentId, viewer, params);
  revalidatePath("/family-chat");
  return { ok: true };
}
