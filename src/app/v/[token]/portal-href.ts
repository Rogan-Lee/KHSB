import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * /v 화면의 "학생 포털로 돌아가기" 링크.
 *
 * 응시 토큰(/v)은 직원이 복사해 카톡 등으로 따로 보내는 좁은 권한의 링크다. 예전엔 여기서 학생의 활성
 * 포털 매직링크(/s/<token>)를 그대로 내려줘서, 응시 링크만 가진 사람도 학생 포털 전체(채팅·일정·개인 정보)에
 * 들어갈 수 있었다. 이제는 요청의 Referer 가 같은 학생의 유효한 포털(/s/<token>/…)일 때만 그 링크를
 * 돌려준다 — 즉 보는 사람이 이미 가진 포털 토큰만 되돌려 준다. (Referer 를 위조하려면 포털 토큰을 이미 알아야 함)
 * 카톡 등에서 바로 연 경우엔 undefined → 화면은 뒤로 가기/창 닫기로 대체된다.
 */
export async function portalHrefFromReferer(studentId: string): Promise<string | undefined> {
  const referer = (await headers()).get("referer");
  if (!referer) return undefined;

  let portalToken: string;
  try {
    const match = new URL(referer).pathname.match(/^\/s\/([^/]+)(?:\/|$)/);
    if (!match) return undefined;
    portalToken = decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
  if (!portalToken || portalToken.length > 128) return undefined;

  const link = await prisma.studentMagicLink.findFirst({
    where: { token: portalToken, studentId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { token: true },
  });
  return link ? `/s/${encodeURIComponent(link.token)}/vocab` : undefined;
}
