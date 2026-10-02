// 입회 상담(/apply)은 강한선배 신청 도메인에서, 로그인·어드민은 어드민 도메인에서만 연다.
// 같은 Vercel 프로젝트에 두 도메인이 붙어 있어 호스트로 나눈다.
export const APPLY_HOST = "apply.kanghanseonbae.com";
export const ADMIN_ORIGIN = "https://admin.kanghanseonbae.com";

const PRODUCTION_HOSTS = new Set([APPLY_HOST, "admin.kanghanseonbae.com", "khsb.vercel.app"]);

export function isApplyPath(pathname: string) {
  return pathname === "/apply" || pathname.startsWith("/apply/");
}

/**
 * 신청 도메인으로 들어온 요청이 /apply 밖이면 보낼 주소를 돌려준다 (그대로 두면 null).
 * 루트는 신청 폼으로, 그 외(/sign-in 등)는 어드민 도메인의 같은 경로로.
 */
export function applyHostRedirect(host: string | null, pathname: string, search = ""): string | null {
  if (host?.toLowerCase() !== APPLY_HOST) return null;
  if (isApplyPath(pathname)) return null;
  if (pathname === "/") return `https://${APPLY_HOST}/apply`;
  return `${ADMIN_ORIGIN}${pathname}${search}`;
}

/** 공유용 /apply 링크의 origin. 운영이면 신청 도메인, 로컬·프리뷰는 현재 origin 그대로. */
export function applyLinkOrigin(currentOrigin: string) {
  try {
    return PRODUCTION_HOSTS.has(new URL(currentOrigin).host) ? `https://${APPLY_HOST}` : currentOrigin;
  } catch {
    return currentOrigin;
  }
}
