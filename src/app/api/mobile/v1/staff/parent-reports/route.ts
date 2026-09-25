import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import {
  createStaffParentReport,
  getStaffParentReports,
} from "@/lib/mobile-staff-parent-reports";

// 학부모 리포트 발송 현황 (웹 /mentoring 리포트 탭과 같은 기준)
export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileStaff(request);
    return mobileJson(await getStaffParentReports({ id: user.id, role: user.role }));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

// POST { mentoringId? | studentId?, customNote?, forceNew? } → { url, shareText, expiresAt, reused … }
export async function POST(request: NextRequest) {
  try {
    const [user, body] = await Promise.all([requireMobileStaff(request), request.json()]);
    const result = await createStaffParentReport({ id: user.id, role: user.role }, body);
    if (!result.reused) {
      revalidatePath("/mentoring");
      revalidatePath(`/mentoring/${result.mentoringId}`);
    }
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
