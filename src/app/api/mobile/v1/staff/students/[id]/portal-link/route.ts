import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import {
  getStaffPortalLink,
  issueStaffPortalLink,
} from "@/lib/mobile-staff-portal-link";

// 학생 포털 링크 — 웹(requireStaff)과 같은 권한: 오프라인 운영진(offlineOps, 원장 포함)

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [, { id }] = await Promise.all([requireMobileStaff(request), context.params]);
    return mobileJson(await getStaffPortalLink(id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

// POST { reissue? } → { url, expiresAt, shareText, reused }
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [user, { id }] = await Promise.all([requireMobileStaff(request), context.params]);
    const body = await request.json().catch(() => ({}));
    const result = await issueStaffPortalLink({ id: user.id }, id, body);
    if (!result.reused) {
      revalidatePath("/students");
      revalidatePath("/attendance");
    }
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
