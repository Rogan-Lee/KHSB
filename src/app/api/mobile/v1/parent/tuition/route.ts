import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { requireParentChildFromQuery } from "@/lib/mobile-parent-services";
import { getParentTuition } from "@/lib/mobile-parent-tuition";

/** 학부모 수강료 — 결제할 청구서·다음 결제 안내·지난 내역 — GET ?studentId= */
export async function GET(request: NextRequest) {
  try {
    const { child } = await requireParentChildFromQuery(request);
    return mobileJson(await getParentTuition(child));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
