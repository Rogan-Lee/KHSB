import type { NextRequest } from "next/server";

import { listFamilyChatsForStaff } from "@/lib/family-chat";
import { mobileApiErrorResponse, mobileJson, requireMobileAnyStaff } from "@/lib/mobile-auth";

/** 가족 톡방 목록 — 재원생 전체 (미확인 → 최근 대화 → 이름 순) */
export async function GET(request: NextRequest) {
  try {
    const appUser = await requireMobileAnyStaff(request);
    return mobileJson({ rooms: await listFamilyChatsForStaff(appUser.id) });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
