import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileParent } from "@/lib/mobile-auth";
import { getParentBadges } from "@/lib/mobile-badges";

export async function GET(request: NextRequest) {
  try {
    const parent = await requireMobileParent(request);
    return mobileJson(await getParentBadges(parent.children.map((c) => c.id)));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
