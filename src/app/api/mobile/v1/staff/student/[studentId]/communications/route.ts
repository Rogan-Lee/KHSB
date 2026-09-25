import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import {
  createStudentCommunication,
  listStudentCommunications,
} from "@/lib/mobile-staff-ops";

type Params = { params: Promise<{ studentId: string }> };

export async function GET(request: NextRequest, context: Params) {
  try {
    const [, { studentId }] = await Promise.all([
      requireMobileStaff(request),
      context.params,
    ]);
    return mobileJson(await listStudentCommunications(studentId));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Params) {
  try {
    const [user, { studentId }, body] = await Promise.all([
      requireMobileStaff(request),
      context.params,
      request.json(),
    ]);
    const result = await createStudentCommunication(studentId, body, user);
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/attendance");
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
