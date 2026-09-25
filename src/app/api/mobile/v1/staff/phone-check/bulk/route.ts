import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { bulkStaffPhoneSubmitted } from "@/lib/mobile-staff-ops-phone";

// body { date, studentIds } — 모두 '제출'로 기록
export async function POST(request: NextRequest) {
  try {
    const [user, body] = await Promise.all([
      requireMobileStaff(request),
      request.json(),
    ]);
    const result = await bulkStaffPhoneSubmitted(body, user.id);
    if (result.count > 0) revalidatePath("/phone-check");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
