import { after, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { notifyAssignedStaffOfQuestion } from "@/lib/mobile-push";
import {
  listMobileStudentQuestions,
  submitMobileStudentQuestion,
} from "@/lib/mobile-student-questions";

export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await listMobileStudentQuestions(student.id));
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
    const question = await submitMobileStudentQuestion(
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
