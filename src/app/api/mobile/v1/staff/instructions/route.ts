import { revalidatePath } from "next/cache";
import { after, type NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileAnyStaff } from "@/lib/mobile-auth";
import {
  getInstructionInbox,
  getStudentInstructionsForStaff,
  sendInstruction,
  sendInstructionPushes,
} from "@/lib/student-instructions";

/** 학생 지시 받은함 — GET (처리 안 한 학부모 요청 + 보낸 지시) · GET ?studentId= (그 학생의 보낸 지시) */
export async function GET(request: NextRequest) {
  try {
    await requireMobileAnyStaff(request);
    const studentId = request.nextUrl.searchParams.get("studentId");
    return mobileJson(
      studentId ? { items: await getStudentInstructionsForStaff(studentId) } : await getInstructionInbox(),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 지시 보내기 — POST { studentId, content, requestId?, draftId? } */
export async function POST(request: NextRequest) {
  try {
    const [user, body] = await Promise.all([requireMobileAnyStaff(request), request.json()]);
    const { item, push } = await sendInstruction(user, body);
    revalidatePath("/instructions");
    revalidatePath(`/students/${item.student.id}`);
    revalidatePath("/attendance");
    after(() => sendInstructionPushes(push));
    return mobileJson({ item });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
