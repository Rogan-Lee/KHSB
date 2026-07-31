import { after, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { getStudentMobileQuestions } from "@/lib/mobile-data";
import { notifyAssignedStaffOfQuestion } from "@/lib/mobile-push";
import { createMobileStudentQuestion } from "@/lib/mobile-workflows";

export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getStudentMobileQuestions(student.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const [student, body] = await Promise.all([
      requireMobileStudent(request),
      request.json(),
    ]);
    const question = await createMobileStudentQuestion(
      { grade: student.grade, id: student.id, name: student.name },
      body,
    );
    revalidatePath("/questions");
    after(() =>
      notifyAssignedStaffOfQuestion({ questionId: question.id }),
    );
    return mobileJson(question);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
