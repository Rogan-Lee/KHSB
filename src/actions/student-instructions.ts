"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { auth } from "@/lib/auth";
import { MobileApiError } from "@/lib/mobile-auth";
import { isAnyStaff } from "@/lib/roles";
import {
  ackInstruction,
  discardInstructionDraft,
  draftInstructionFromRequest,
  getInstructionInbox,
  getStudentInstructionsForStaff,
  listInstructionsForStudent,
  sendInstruction,
  sendInstructionPushes,
} from "@/lib/student-instructions";
import { validateMagicLink } from "@/lib/student-auth";

// 학생 지시 — 웹 운영진 화면(소통 › 학생 지시, 학생 상세, 멘토링 상세)과 학생 웹 포털.
// 로직은 src/lib/student-instructions.ts (모바일 API 와 공용).

type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id || !isAnyStaff(session.user.role)) throw new Error("권한이 없습니다");
  return { id: session.user.id, name: session.user.name };
}

/** 사용자에게 보여 줄 오류만 문구로 — 운영 빌드는 던진 오류 문구를 가린다 */
async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof MobileApiError) return { ok: false, error: error.message };
    console.error("[student-instructions]", error);
    return { ok: false, error: "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요" };
  }
}

// ─── 운영진 ───────────────────────────────────────────────────────────

export async function getInstructionInboxAction() {
  await requireStaff();
  return getInstructionInbox();
}

export async function getStudentInstructionsAction(studentId: string) {
  await requireStaff();
  return getStudentInstructionsForStaff(studentId);
}

/** 지시 보내기 — AI 초안 승인(draftId) · 학부모 요청 처리(requestId) · 바로 지시(studentId 만) */
export async function sendInstructionAction(input: {
  studentId: string;
  content: string;
  requestId?: string;
  draftId?: string;
}) {
  const staff = await requireStaff();
  return attempt(async () => {
    const { item, push } = await sendInstruction(staff, input);
    after(() => sendInstructionPushes(push));
    revalidatePath("/instructions");
    revalidatePath(`/students/${item.student.id}`);
    revalidatePath("/attendance");
    return item;
  });
}

export async function discardInstructionDraftAction(id: string) {
  await requireStaff();
  return attempt(async () => {
    await discardInstructionDraft(id);
    revalidatePath("/instructions");
  });
}

/** AI 초안 다시 만들기 */
export async function regenerateInstructionDraftAction(requestId: string) {
  await requireStaff();
  return attempt(async () => {
    const draft = await draftInstructionFromRequest(requestId, { force: true });
    if (!draft) {
      throw new MobileApiError("AI가 이 요청에서 학생에게 줄 지시를 찾지 못했어요. 직접 적어 주세요", 422);
    }
    revalidatePath("/instructions");
    return draft;
  });
}

// ─── 학생 웹 포털 (/s/[token]) ────────────────────────────────────────

async function requirePortalStudent(studentToken: string) {
  const session = await validateMagicLink(studentToken);
  if (!session) throw new Error("권한이 없습니다");
  return session.student;
}

export async function listMyInstructions(params: { studentToken: string }) {
  const student = await requirePortalStudent(params.studentToken);
  return listInstructionsForStudent(student.id);
}

export async function ackMyInstruction(params: { studentToken: string; id: string }) {
  const student = await requirePortalStudent(params.studentToken);
  return attempt(async () => {
    await ackInstruction(student.id, params.id);
    revalidatePath("/instructions");
    revalidatePath(`/students/${student.id}`);
  });
}
