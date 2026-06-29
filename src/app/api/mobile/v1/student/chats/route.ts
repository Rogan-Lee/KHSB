import { type NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileStudent } from "@/lib/mobile-auth";
import { getStudentChats } from "@/lib/mobile-chat";

export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson({ chats: await getStudentChats(student.id) });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
