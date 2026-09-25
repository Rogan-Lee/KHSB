import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileStudent } from "@/lib/mobile-auth";
import { getStudentBadges } from "@/lib/mobile-badges";

export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getStudentBadges(student.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
