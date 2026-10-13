import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { requireParentChildFromBody } from "@/lib/mobile-parent-services";
import {
  requestParentTuitionOnsite,
  withdrawParentTuitionOnsite,
} from "@/lib/mobile-parent-tuition";

/** 현장 결제 신청 — POST { studentId, invoiceId, method: "LOCAL_CURRENCY" | "ONSITE_CARD" } */
export async function POST(request: NextRequest) {
  try {
    const { parent, child, body } = await requireParentChildFromBody(request);
    return mobileJson(await requestParentTuitionOnsite(parent.authUserId, child, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 현장 결제 신청 철회 — DELETE { studentId, paymentId } */
export async function DELETE(request: NextRequest) {
  try {
    const { parent, child, body } = await requireParentChildFromBody(request);
    return mobileJson(await withdrawParentTuitionOnsite(parent.authUserId, child, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
