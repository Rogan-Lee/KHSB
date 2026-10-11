import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { requireSafetyActor } from "@/lib/mobile-safety";
import { blockUser, listMyBlocks, unblockUser } from "@/lib/safety";

/** 내가 차단한 사용자 목록 */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireSafetyActor(request);
    return mobileJson({ blocks: await listMyBlocks(actor) });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 차단 { userType, userId } */
export async function POST(request: NextRequest) {
  try {
    const [actor, body] = await Promise.all([requireSafetyActor(request), request.json()]);
    return mobileJson(await blockUser(actor, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 차단 해제 { userType, userId } */
export async function DELETE(request: NextRequest) {
  try {
    const [actor, body] = await Promise.all([requireSafetyActor(request), request.json()]);
    return mobileJson(await unblockUser(actor, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
