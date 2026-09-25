import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import {
  createStaffMobileMerit,
  getStaffMobileMerits,
} from "@/lib/mobile-staff-ops-merits";

// ?studentId= 학생별 목록·합계 (없으면 최근 전체) + 자주 쓴 사유·카테고리
export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileStaff(request);
    const studentId = request.nextUrl.searchParams.get("studentId");
    return mobileJson(await getStaffMobileMerits(studentId || null, user.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, body] = await Promise.all([
      requireMobileStaff(request),
      request.json(),
    ]);
    const result = await createStaffMobileMerit(body, user.id);
    revalidatePath("/merit-demerit");
    revalidatePath(`/students/${result.studentId}`);
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
