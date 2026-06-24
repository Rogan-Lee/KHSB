import { type NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileAccount } from "@/lib/mobile-auth";
import { getStaffChats } from "@/lib/mobile-chat";

export async function GET(request: NextRequest) {
  try {
    const { appUser } = await requireMobileAccount(request);
    if (!appUser) {
      return mobileApiErrorResponse(new Error("권한이 없습니다"));
    }
    return mobileJson({ chats: await getStaffChats(appUser.id) });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
