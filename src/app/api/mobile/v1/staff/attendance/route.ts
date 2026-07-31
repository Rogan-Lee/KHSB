import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getStaffMobileAttendance } from "@/lib/mobile-data";

export async function GET(request: NextRequest) {
  try {
    await requireMobileStaff(request);
    return mobileJson(await getStaffMobileAttendance());
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
