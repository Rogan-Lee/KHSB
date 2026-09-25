import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getStaffMentoringDetail } from "@/lib/mobile-staff-mentoring";

// 멘토링 상세(기록 + 사진 + 학부모 리포트 상태). 기록 저장은 PATCH ../ (mobile-workflows)
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ mentoringId: string }> },
) {
  try {
    const [user, { mentoringId }] = await Promise.all([
      requireMobileStaff(request),
      context.params,
    ]);
    return mobileJson(
      await getStaffMentoringDetail(mentoringId, { id: user.id, role: user.role }),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
