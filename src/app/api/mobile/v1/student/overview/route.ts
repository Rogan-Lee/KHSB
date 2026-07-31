import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getStudentMobileOverview } from "@/lib/mobile-data";

export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(
      await getStudentMobileOverview(student.id, student.isOnlineManaged),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
