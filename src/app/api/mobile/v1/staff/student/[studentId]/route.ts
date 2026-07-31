import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getStaffMobileStudentDetail } from "@/lib/mobile-data";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ studentId: string }> },
) {
  try {
    const [, { studentId }] = await Promise.all([
      requireMobileStaff(request),
      context.params,
    ]);
    return mobileJson(await getStaffMobileStudentDetail(studentId));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
