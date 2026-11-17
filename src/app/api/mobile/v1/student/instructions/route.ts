import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileStudent } from "@/lib/mobile-auth";
import { listInstructionsForStudent } from "@/lib/student-instructions";

/** 내가 받은 지시 — { items, unacked } */
export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await listInstructionsForStudent(student.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
