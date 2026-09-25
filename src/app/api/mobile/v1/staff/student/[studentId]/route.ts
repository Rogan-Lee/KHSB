import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getStaffStudentProfile } from "@/lib/mobile-staff-ops";

// 기존 필드(info·assignments·scores) 유지 + today·attendance14·merits·communications·mentorings 확장
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ studentId: string }> },
) {
  try {
    const [user, { studentId }] = await Promise.all([
      requireMobileStaff(request),
      context.params,
    ]);
    return mobileJson(await getStaffStudentProfile(studentId, user.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
