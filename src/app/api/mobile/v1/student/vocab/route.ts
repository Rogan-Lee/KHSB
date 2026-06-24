import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getMobileVocabList } from "@/lib/mobile-vocab";

export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getMobileVocabList(student.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
