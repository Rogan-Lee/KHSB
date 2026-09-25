import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { claimParentLunchDeposit } from "@/lib/mobile-parent-lunch";
import { requireParentChildFromBody } from "@/lib/mobile-parent-services";

/** "입금했어요" — POST { studentId } */
export async function POST(request: NextRequest) {
  try {
    const { child } = await requireParentChildFromBody(request);
    return mobileJson(await claimParentLunchDeposit(child));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
