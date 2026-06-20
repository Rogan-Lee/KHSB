import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getMobileStudentTasks } from "@/lib/mobile-tasks";

export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getMobileStudentTasks(student.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
