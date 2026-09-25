import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { mobileApiErrorResponse, mobileJson, requireMobileAnyStaff } from "@/lib/mobile-auth";
import { createMobileAnnouncement, getMobileAnnouncements } from "@/lib/mobile-staff-notices";

// GET ?page=mentoring|monthly_notice|monthly_recommendation&offset=0
export async function GET(request: NextRequest) {
  try {
    const user = await requireMobileAnyStaff(request);
    const params = request.nextUrl.searchParams;
    return mobileJson(await getMobileAnnouncements(user, params.get("page"), params.get("offset")));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

// POST { page, title?, content } — 원장 전용
export async function POST(request: NextRequest) {
  try {
    const [user, body] = await Promise.all([requireMobileAnyStaff(request), request.json()]);
    const result = await createMobileAnnouncement(user, body);
    revalidatePath("/mentoring");
    revalidatePath("/reports/monthly");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
