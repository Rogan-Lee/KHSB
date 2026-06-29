import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileOnlineStaff,
} from "@/lib/mobile-auth";
import { getMobileStaffTasks } from "@/lib/mobile-tasks";

export async function GET(request: NextRequest) {
  try {
    await requireMobileOnlineStaff(request);
    return mobileJson(await getMobileStaffTasks());
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
