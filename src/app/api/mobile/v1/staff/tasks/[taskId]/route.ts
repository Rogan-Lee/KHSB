import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileOnlineStaff,
} from "@/lib/mobile-auth";
import { getMobileStaffTask } from "@/lib/mobile-tasks";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const [, { taskId }] = await Promise.all([
      requireMobileOnlineStaff(request),
      context.params,
    ]);
    return mobileJson(await getMobileStaffTask(taskId));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
