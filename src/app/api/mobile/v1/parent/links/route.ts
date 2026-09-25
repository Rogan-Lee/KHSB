import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileParent,
} from "@/lib/mobile-auth";
import { previewParentLink, redeemParentLink } from "@/lib/mobile-parent-links";

/** 자녀 추가 연결 미리보기 — ?inviteToken=코드 또는 초대 링크 */
export async function GET(request: NextRequest) {
  try {
    const parent = await requireMobileParent(request);
    return mobileJson(
      await previewParentLink(parent, request.nextUrl.searchParams.get("inviteToken")),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 자녀 추가 연결 — { inviteToken } (학부모 초대, 1회용) */
export async function POST(request: NextRequest) {
  try {
    const parent = await requireMobileParent(request);
    return mobileJson(await redeemParentLink(parent, await request.json()));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
