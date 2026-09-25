import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileStudent } from "@/lib/mobile-auth";
import { claimStudentLunchDeposit } from "@/lib/mobile-student-lunch";

/** "입금했어요" — POST */
export async function POST(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await claimStudentLunchDeposit(student));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
