import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAnyStaff, isStaff } from "@/lib/roles";

// (dashboard) page 공통 인증 가드.
//
// layout.tsx 의 직원 검사만으로는 page 를 보호할 수 없다. App Router 는 클라이언트 내비게이션
// (RSC 요청) 때 이미 렌더된 공유 레이아웃을 다시 실행하지 않으므로(Partial Rendering),
// Next-Router-State-Tree 헤더를 조작한 RSC 요청은 layout 검사를 건너뛰고 page 만 렌더링한다.
// proxy.ts 는 세션 쿠키 "존재"만 보므로, 데이터를 읽는 모든 page 는 스스로 세션·역할을 확인해야 한다.

const getSession = cache(auth);

type Session = NonNullable<Awaited<ReturnType<typeof auth>>>;

/**
 * 직원 세션(STAFF_ROLES + ONLINE_ROLES — layout.tsx 와 같은 기준)을 요구한다.
 * 세션이 없거나 직원이 아니면 /sign-in 으로 보낸다.
 * `allow` 를 주면 추가 역할 조건을 확인하고, 통과하지 못하면 `fallback`(기본 "/")으로 보낸다
 * (온라인 전용 역할은 "/online").
 */
export async function requireDashboardSession(
  allow?: (role?: string | null) => boolean,
  fallback: string = "/",
): Promise<Session> {
  const session = await getSession();
  if (!session?.user) redirect("/sign-in");
  if (!isAnyStaff(session.user.role)) redirect("/sign-in");
  // 온라인 전용 역할의 홈(/)은 오프라인 전용 위젯이 requireStaff 로 막혀 있으므로 /online 으로 보낸다
  if (allow && !allow(session.user.role)) redirect(isStaff(session.user.role) ? fallback : "/online");
  return session;
}
