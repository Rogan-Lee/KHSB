import type { NextRequest } from "next/server";

import { getAuthIdentity } from "@/lib/auth";
import { isOnlineStaff, isStaff } from "@/lib/roles";

export class MobileApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function requireMobileStudent(request: NextRequest) {
  const current = await getAuthIdentity(request.headers);
  if (!current) throw new MobileApiError("로그인이 필요합니다", 401);

  const student = current.identity.student;
  if (!student || student.status !== "ACTIVE") {
    throw new MobileApiError("학생 계정으로 이용할 수 없습니다", 403);
  }

  return student;
}

export async function requireMobileAccount(request: NextRequest) {
  const current = await getAuthIdentity(request.headers);
  if (!current) throw new MobileApiError("로그인이 필요합니다", 401);

  const appUser = current.identity.appUser;
  const student = current.identity.student;
  const activeAppUser = appUser?.status === "ACTIVE" ? appUser : null;
  const activeStudent = student?.status === "ACTIVE" ? student : null;
  if (!activeAppUser && !activeStudent) {
    throw new MobileApiError("사용할 수 없는 계정입니다", 403);
  }

  return {
    appUser: activeAppUser,
    authUserId: current.identity.id,
    student: activeStudent,
  };
}

export async function requireMobileStaff(request: NextRequest) {
  const current = await getAuthIdentity(request.headers);
  if (!current) throw new MobileApiError("로그인이 필요합니다", 401);

  const user = current.identity.appUser;
  if (!user || user.status !== "ACTIVE" || !isStaff(user.role)) {
    throw new MobileApiError("운영진 계정으로 이용할 수 없습니다", 403);
  }

  return user;
}

export async function requireMobileOnlineStaff(request: NextRequest) {
  const current = await getAuthIdentity(request.headers);
  if (!current) throw new MobileApiError("로그인이 필요합니다", 401);

  const user = current.identity.appUser;
  if (!user || user.status !== "ACTIVE" || !isOnlineStaff(user.role)) {
    throw new MobileApiError("온라인 관리 권한이 필요합니다", 403);
  }

  return user;
}

export function mobileApiErrorResponse(error: unknown) {
  if (error instanceof MobileApiError) {
    return Response.json(
      { error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof SyntaxError) {
    return Response.json(
      { error: "요청 형식을 확인하세요" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error("[mobile-api]", error);
  return Response.json(
    { error: "요청을 처리하지 못했습니다" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export function mobileJson(data: unknown) {
  return Response.json(data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
