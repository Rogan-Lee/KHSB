import type { NextRequest } from "next/server";

import { getAppUrl } from "@/lib/app-url";
import { getAuthIdentity } from "@/lib/auth";
import { signFileUrls } from "@/lib/blob-store";
import { clientIp, queueAccessLog } from "@/lib/privacy/access-log";
import { prisma } from "@/lib/prisma";
import { isOnlineStaff, isStaff } from "@/lib/roles";

export class MobileApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** 앱에서 직원이 부른 API 도 접속 기록에 남긴다 (조회는 VIEW, 그 밖은 ACTION) */
function logMobileAccess(request: NextRequest, user: { id: string; name: string }) {
  try {
    queueAccessLog({
      actor: user,
      action: request.method === "GET" ? "VIEW" : "ACTION",
      path: new URL(request.url).pathname,
      ip: clientIp(request.headers),
    });
  } catch (error) {
    // 기록 때문에 요청이 실패하면 안 된다
    console.error("[access-log] mobile", error);
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

export async function requireMobileParent(request: NextRequest) {
  const current = await getAuthIdentity(request.headers);
  if (!current) throw new MobileApiError("로그인이 필요합니다", 401);

  const links = await prisma.parentLink.findMany({
    where: { authUserId: current.identity.id, student: { status: "ACTIVE" } },
    // 학부모 요청마다 실행 — 링크 행 컬럼은 쓰지 않으므로 자녀 정보만
    select: {
      student: { select: { grade: true, id: true, name: true, seat: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (links.length === 0) {
    throw new MobileApiError("학부모 계정으로 이용할 수 없습니다", 403);
  }

  return {
    authUserId: current.identity.id,
    children: links.map((link) => link.student),
  };
}

/** 요청 studentId 가 세션 학부모의 자녀인지 강제 검증 후 자녀 정보 반환 */
export async function requireParentChild(
  request: NextRequest,
  studentId: string | null,
) {
  const parent = await requireMobileParent(request);
  const child = parent.children.find((c) => c.id === studentId);
  if (!child) {
    throw new MobileApiError("자녀 정보에 접근할 수 없습니다", 403);
  }
  return child;
}

export async function requireMobileAccount(request: NextRequest) {
  const current = await getAuthIdentity(request.headers);
  if (!current) throw new MobileApiError("로그인이 필요합니다", 401);

  const appUser = current.identity.appUser;
  const student = current.identity.student;
  const activeAppUser = appUser?.status === "ACTIVE" ? appUser : null;
  const activeStudent = student?.status === "ACTIVE" ? student : null;
  if (!activeAppUser && !activeStudent) {
    // 학부모 계정: appUser/student 없이 ParentLink 로만 연결됨 — 푸시 토큰 등록 등 공용 API 허용
    const parentLinkCount = await prisma.parentLink.count({
      where: { authUserId: current.identity.id, student: { status: "ACTIVE" } },
    });
    if (parentLinkCount === 0) {
      throw new MobileApiError("사용할 수 없는 계정입니다", 403);
    }
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

  logMobileAccess(request, user);
  return user;
}

/** 오프라인 운영진(isStaff) 또는 온라인 관리 역할(isOnlineStaff) — 역할별 기능은 capabilities 로 분기 */
export async function requireMobileAnyStaff(request: NextRequest) {
  const current = await getAuthIdentity(request.headers);
  if (!current) throw new MobileApiError("로그인이 필요합니다", 401);

  const user = current.identity.appUser;
  if (!user || user.status !== "ACTIVE" || !(isStaff(user.role) || isOnlineStaff(user.role))) {
    throw new MobileApiError("운영진 계정으로 이용할 수 없습니다", 403);
  }

  logMobileAccess(request, user);
  return user;
}

export async function requireMobileOnlineStaff(request: NextRequest) {
  const current = await getAuthIdentity(request.headers);
  if (!current) throw new MobileApiError("로그인이 필요합니다", 401);

  const user = current.identity.appUser;
  if (!user || user.status !== "ACTIVE" || !isOnlineStaff(user.role)) {
    throw new MobileApiError("온라인 관리 권한이 필요합니다", 403);
  }

  logMobileAccess(request, user);
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

// 비공개 저장소 첨부(/api/files/…)는 앱이 쿠키 없이 이미지·문서를 열 수 있게 서명된 절대 주소로 바꿔 보낸다
// (이전 앱 빌드도 그대로 보인다). 비공개 저장소가 꺼져 있으면 data 그대로.
export function mobileJson(data: unknown) {
  return Response.json(signFileUrls(data, getAppUrl().replace(/\/+$/, "")), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
