import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileAnyStaff } from "@/lib/mobile-auth";
import { getStaffBadges } from "@/lib/mobile-badges";

export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileAnyStaff(request);
    return mobileJson(await getStaffBadges(user.id, user.role));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
