import { headers } from "next/headers";
import { cache } from "react";

import { authServer } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

export async function getAuthIdentity(requestHeaders?: Headers) {
  if (!requestHeaders) return getCookieAuthIdentity();
  return resolveAuthIdentity(requestHeaders);
}

// 쿠키 세션 조회는 요청 단위로 1번만 — 페이지·레이아웃·서버 액션이 auth()/getUser() 를 여러 번 불러도
// 세션·사용자 쿼리(4개)가 반복되지 않게 한다. (React cache 는 요청 범위 밖에선 캐시하지 않음)
const getCookieAuthIdentity = cache(async () => resolveAuthIdentity(await headers()));

async function resolveAuthIdentity(requestHeaders: Headers) {
  const session = await authServer.api.getSession({
    headers: requestHeaders,
  });
  if (!session) return null;

  const identity = await prisma.authUser.findUnique({
    where: { id: session.user.id },
    include: {
      appUser: true,
      student: true,
    },
  });
  if (!identity) return null;

  return {
    identity,
    session,
  };
}

export async function getUser() {
  const authIdentity = await getAuthIdentity();
  const user = authIdentity?.identity.appUser;

  if (!user || user.status !== "ACTIVE") return null;
  return user;
}

export async function getStudent() {
  const authIdentity = await getAuthIdentity();
  const student = authIdentity?.identity.student;

  if (!student || student.status !== "ACTIVE") return null;
  return student;
}

// 기존 Server Action들과의 호환성 레이어.
// session.user.id / role / name 사용 코드를 그대로 유지한다.
export async function auth(): Promise<{
  user: {
    email?: string;
    id: string;
    name: string;
    role: string;
  };
} | null> {
  const user = await getUser();
  if (!user) return null;
  return {
    user: {
      email: user.email,
      id: user.id,
      name: user.name,
      role: user.role,
    },
  };
}
