import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileAnyStaff,
} from "@/lib/mobile-auth";
import { getMobileStaffTasks } from "@/lib/mobile-tasks";

// 전 직원 — 원장·SA 는 전체, 그 외는 담당 학생 수행평가만 (웹 /online/performance 와 동일)
export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileAnyStaff(request);
    return mobileJson(await getMobileStaffTasks({ id: user.id, role: user.role }));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
