import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { bulkStaffPhoneSubmitted } from "@/lib/mobile-staff-ops-phone";

// body { date, period?, studentIds, exemptIds? } — 기록 없는 학생만 '제출'(exemptIds 는 '면제')로
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
