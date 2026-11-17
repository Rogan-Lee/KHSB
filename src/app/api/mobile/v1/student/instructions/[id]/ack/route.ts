import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileStudent } from "@/lib/mobile-auth";
import { ackInstruction } from "@/lib/student-instructions";

/** [확인했어요] */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const [student, { id }] = await Promise.all([requireMobileStudent(request), context.params]);
    const result = await ackInstruction(student.id, id);
    revalidatePath("/instructions");
    revalidatePath(`/students/${student.id}`);
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
