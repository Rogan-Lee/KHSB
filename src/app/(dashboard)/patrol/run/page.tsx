import { getPatrolPortalData } from "@/actions/patrol";
import { getAttentionStudents } from "@/lib/attention";
import { PatrolDesktop } from "./_components/patrol-desktop";

export const dynamic = "force-dynamic";

// 앱 내 순찰 모드 (데스크탑 전용) — 로그인 세션 인증(매직링크 토큰 불필요).
// 진입 즉시 진행 중 회차가 없으면 자동 시작(autoStart).
// 모바일/외부 근무자는 매직링크 순찰 화면(/w/[token])을 사용.
export default async function InAppPatrolRunPage() {
  const initial = await getPatrolPortalData(); // 세션 기반 (token 없음)
  const attention = await getAttentionStudents({
    rosterStudentIds: initial.roster.map((s) => s.id),
  });
  return <PatrolDesktop initial={initial} attention={attention} autoStart />;
}
