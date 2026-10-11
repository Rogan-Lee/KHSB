"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { MobileApiError } from "@/lib/mobile-auth";
import { requireFullAccess } from "@/lib/roles";
import { resolveContentReport, type ReportResolution } from "@/lib/safety";

export type ResolveReportResult = { ok: true } | { ok: false; error: string };

/**
 * 신고 처리 (원장 — FULL_ACCESS). 핵심 로직은 @/lib/safety (모바일 API 와 공용).
 * 입력 오류·이미 처리된 신고처럼 안내가 필요한 실패(MobileApiError)는 던지지 않고 문구로 돌려준다 —
 * 서버 액션에서 던진 오류 문구는 프로덕션 빌드에서 가려져 화면까지 가지 않는다.
 */
export async function resolveReport(params: {
  reportId: string;
  resolution: ReportResolution;
  note?: string;
}): Promise<ResolveReportResult> {
  const session = await auth();
  requireFullAccess(session?.user?.role);

  try {
    // 입력값 검증(zod)은 lib 에서 한다
    await resolveContentReport({ id: session!.user!.id, name: session!.user!.name }, params);
  } catch (e) {
    if (e instanceof MobileApiError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath("/moderation");
  return { ok: true };
}
