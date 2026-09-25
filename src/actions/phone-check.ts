"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/roles";
import {
  bulkUpsertPhoneSubmitted,
  loadPhoneCheckBoard,
  upsertPhoneCheck,
  type PhoneCheckRow,
} from "@/lib/phone-check-core";
import type { PhoneCheckStatus } from "@/generated/prisma";

// 조회·저장 로직은 @/lib/phone-check-core (모바일 API 와 공유)
export type { PhoneCheckRow } from "@/lib/phone-check-core";

async function requireSessionStaff() {
  const session = await auth();
  requireStaff(session?.user?.role);
  return session!.user!;
}

/** 해당 날짜의 휴대폰 제출 검사 보드: ACTIVE 학생 전체(좌석순) + 입실 여부 + 검사 기록. */
export async function getPhoneCheckBoard(date: string): Promise<PhoneCheckRow[]> {
  await requireSessionStaff();
  return loadPhoneCheckBoard(date);
}

/** 학생 1명 검사 상태 upsert. */
export async function setPhoneCheck(
  studentId: string,
  date: string,
  status: PhoneCheckStatus,
  note?: string,
): Promise<void> {
  const user = await requireSessionStaff();
  await upsertPhoneCheck({ studentId, date, status, note, checkedById: user.id });
  revalidatePath("/phone-check");
}

/** 다건 제출 처리 (입실자 일괄 제출용). */
export async function bulkMarkSubmitted(date: string, studentIds: string[]): Promise<number> {
  const user = await requireSessionStaff();
  const count = await bulkUpsertPhoneSubmitted(date, studentIds, user.id);
  if (studentIds.length > 0) revalidatePath("/phone-check");
  return count;
}
