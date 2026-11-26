import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { clearStaffPhoneCheck, setStaffPhoneCheck } from "@/lib/mobile-staff-ops-phone";

// body { date, period?, status: SUBMITTED|NOT_SUBMITTED|ABSENT|EXEMPT, note? }
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ studentId: string }> },
) {
  try {
    const [user, { studentId }, body] = await Promise.all([
      requireMobileStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await setStaffPhoneCheck(studentId, body, user.id);
    revalidatePath("/phone-check");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

// ?date=&period= — 그 교시 기록 지우기 (검사 중 누른 칸 되돌리기)
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ studentId: string }> },
) {
  try {
    const [, { studentId }] = await Promise.all([requireMobileStaff(request), context.params]);
    const params = request.nextUrl.searchParams;
    const result = await clearStaffPhoneCheck(studentId, params.get("date"), params.get("period"));
    revalidatePath("/phone-check");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
