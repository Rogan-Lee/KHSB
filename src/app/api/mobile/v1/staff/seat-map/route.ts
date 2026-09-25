import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getStaffSeatMap } from "@/lib/mobile-staff-ops";

// 좌석 배치(웹 배치도와 같은 정의) + 오늘 입퇴실 상태
export async function GET(request: NextRequest) {
  try {
    await requireMobileStaff(request);
    return mobileJson(await getStaffSeatMap());
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
