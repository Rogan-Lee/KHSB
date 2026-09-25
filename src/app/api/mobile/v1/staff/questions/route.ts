import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import { getMobileStaffQuestionInbox } from "@/lib/mobile-staff-questions";

/** 직원 질문 받은함 — ?filter=waiting(기본)|mine|all */
export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileStaff(request);
    const filter = request.nextUrl.searchParams.get("filter");
    return mobileJson(await getMobileStaffQuestionInbox(user.id, filter));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
