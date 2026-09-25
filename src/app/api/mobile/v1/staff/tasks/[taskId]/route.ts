import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileAnyStaff,
} from "@/lib/mobile-auth";
import { getMobileStaffTask } from "@/lib/mobile-tasks";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const [user, { taskId }] = await Promise.all([
      requireMobileAnyStaff(request),
      context.params,
    ]);
    return mobileJson(
      await getMobileStaffTask({ id: user.id, role: user.role }, taskId),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
