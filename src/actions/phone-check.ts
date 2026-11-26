"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/roles";
import {
  bulkCreatePhoneChecks,
  deletePhoneCheck,
  loadPhoneCheckBoard,
  upsertPhoneCheck,
  type PhoneCheckBoardData,
} from "@/lib/phone-check-core";
import type { PhoneCheckStatus } from "@/generated/prisma";

// 조회·저장 로직은 @/lib/phone-check-core (모바일 API 와 공유)
export type { PhoneCheckBoardData, PhoneCheckRow } from "@/lib/phone-check-core";

async function requireSessionStaff() {
  const session = await auth();
  requireStaff(session?.user?.role);
  return session!.user!;
}

/** 해당 날짜·교시(0=입실 때)의 휴대폰 제출 검사 보드: ACTIVE 학생 전체(좌석순) + 자리 판정 + 검사 기록. */
export async function getPhoneCheckBoard(date: string, period = 0): Promise<PhoneCheckBoardData> {
  await requireSessionStaff();
  return loadPhoneCheckBoard(date, { period });
}

/** 학생 1명 검사 상태 upsert. */
export async function setPhoneCheck(
  studentId: string,
  date: string,
  status: PhoneCheckStatus,
  note?: string,
  period = 0,
): Promise<void> {
  const user = await requireSessionStaff();
  await upsertPhoneCheck({ studentId, date, status, note, checkedById: user.id, period });
  revalidatePath("/phone-check");
}

/** 학생 1명 기록 지우기 (검사 중 누른 칸 되돌리기). */
export async function clearPhoneCheck(studentId: string, date: string, period = 0): Promise<void> {
  await requireSessionStaff();
  await deletePhoneCheck(studentId, date, period);
  revalidatePath("/phone-check");
}

/** 검사 완료 — 기록 없는 재실자를 제출(앞 교시 면제는 면제)로. 이미 기록된 학생은 그대로. */
export async function completePhoneCheck(
  date: string,
  period: number,
  submittedIds: string[],
  exemptIds: string[] = [],
): Promise<number> {
  const user = await requireSessionStaff();
  const count = await bulkCreatePhoneChecks(date, { submitted: submittedIds, exempt: exemptIds }, user.id, period);
  if (count > 0) revalidatePath("/phone-check");
  return count;
}
