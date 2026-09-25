import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import {
  getMobileStudentNaps,
  requestMobileStudentNap,
} from "@/lib/mobile-student-life";

/** 쪽잠 — 오늘 + 최근 7일 신청, 오늘 사용 횟수, 하루 한도 */
export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    return mobileJson(await getMobileStudentNaps(student.id));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 쪽잠 신청 (오늘) — body { startTime: "HH:MM", durationMin: 20 | 30 } */
export async function POST(request: NextRequest) {
  try {
    const [student, body] = await Promise.all([
      requireMobileStudent(request),
      request.json(),
    ]);
    return mobileJson(
      await requestMobileStudentNap(
        { id: student.id, name: student.name, grade: student.grade },
        body,
      ),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
