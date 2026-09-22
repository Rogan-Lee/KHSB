import type { NextRequest } from "next/server";

import { getAppUrl } from "@/lib/app-url";
import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStudent,
} from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { issueMagicLink } from "@/lib/student-auth";

/**
 * 로그인된 학생에게 학생 포털(`/s/[token]`) 매직링크 토큰 발급.
 * 활성 링크(만료 전 + 미무효화)가 있으면 재사용, 없으면 신규 발급.
 * 모바일 앱의 포털 웹뷰 브리지 용.
 */
export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);

    const existing = await prisma.studentMagicLink.findFirst({
      where: {
        studentId: student.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { issuedAt: "desc" },
      select: { token: true, expiresAt: true },
    });

    const link = existing ?? (await issueMagicLink({ studentId: student.id }));

    return mobileJson({
      token: link.token,
      expiresAt: link.expiresAt.toISOString(),
      baseUrl: getAppUrl(),
    });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
