import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getStaffMobileMentoring } from "@/lib/mobile-data";

export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileStaff(request);
    return mobileJson(
      await getStaffMobileMentoring(user.id, user.role),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
