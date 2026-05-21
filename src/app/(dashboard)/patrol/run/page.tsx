import { getPatrolPortalData } from "@/actions/patrol";
import { PatrolPortal } from "@/app/w/[token]/_components/patrol-portal";

export const dynamic = "force-dynamic";

// 앱 내 순찰 모드 — 로그인 세션 인증(매직링크 토큰 불필요).
// 진입 즉시 진행 중 회차가 없으면 자동 시작(autoStart).
export default async function InAppPatrolRunPage() {
  const initial = await getPatrolPortalData(); // 세션 기반 (token 없음)
  // 콘텐츠 카드 패딩(p-4 md:px-[22px] py-[20px])을 상쇄해 포털을 카드에 꽉 채움
  return (
    <div className="-m-4 md:-mx-[22px] md:-my-[20px]">
      <PatrolPortal initial={initial} autoStart />
    </div>
  );
}
