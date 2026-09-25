import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { mobileApiErrorResponse, mobileJson, requireMobileAnyStaff } from "@/lib/mobile-auth";
import { deleteMobileAnnouncement, updateMobileAnnouncement } from "@/lib/mobile-staff-notices";

type Context = { params: Promise<{ announcementId: string }> };

function revalidate() {
  revalidatePath("/mentoring");
  revalidatePath("/reports/monthly");
}

// PATCH { title?, content } — 원장 전용
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const [user, { announcementId }, body] = await Promise.all([
      requireMobileAnyStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await updateMobileAnnouncement(user, announcementId, body);
    revalidate();
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

// DELETE — 원장 전용, 멘토링 공지만
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const [user, { announcementId }] = await Promise.all([
      requireMobileAnyStaff(request),
      context.params,
    ]);
    const result = await deleteMobileAnnouncement(user, announcementId);
    revalidate();
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
