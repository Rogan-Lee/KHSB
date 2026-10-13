import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { requireParentChildFromBody } from "@/lib/mobile-parent-services";
import { syncParentTuition } from "@/lib/mobile-parent-tuition";

/** 결제 확인 — 결제창에서 돌아온 뒤 결제사에 다시 물어 반영 — POST { studentId, invoiceId } */
export async function POST(request: NextRequest) {
  try {
    const { child, body } = await requireParentChildFromBody(request);
    return mobileJson(await syncParentTuition(child, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
