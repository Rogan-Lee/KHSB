import { type NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileAnyStaff } from "@/lib/mobile-auth";
import { getStaffChats } from "@/lib/mobile-chat";

export async function GET(request: NextRequest) {
  try {
    // 직원(오프라인·온라인) 계정만 — 학생·학부모 세션은 403
    const appUser = await requireMobileAnyStaff(request);
    return mobileJson({ chats: await getStaffChats(appUser.id) });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
