import type { NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/cron-auth";
import { purgeExpiredFamilyChats } from "@/lib/family-chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 매주 월요일 KST 04:00 (vercel.json "0 19 * * 0") — 퇴원 후 1년이 지난 학생의 가족 톡방을
 * 첨부 파일과 함께 파기한다 (개인정보 처리방침 보관 기간).
 */
export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  return Response.json({ ok: true, ...(await purgeExpiredFamilyChats()) });
}
