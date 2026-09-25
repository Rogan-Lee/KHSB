import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import {
  getMobileStudentNetwork,
  requestMobileStudentNetwork,
} from "@/lib/mobile-student-life";

/** 네트워크 사용 신청 목록 — 최신 30건 */
export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getMobileStudentNetwork(student.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 네트워크 사용 신청 — body { kind, target?, startAt, endAt ("YYYY-MM-DDTHH:MM" KST), reason } */
export async function POST(request: NextRequest) {
  try {
    const [student, body] = await Promise.all([
      requireMobileStudent(request),
      request.json(),
    ]);
    return mobileJson(
      await requestMobileStudentNetwork(
        { id: student.id, name: student.name, grade: student.grade },
        body,
      ),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
