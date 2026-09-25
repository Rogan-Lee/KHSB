import { Lock } from 'lucide-react-native';

import { EmptyState, Screen } from '@/design';
import { isStaffCapabilities } from '@/lib/capabilities';
import { useSession } from '@/lib/session';

/** 자습실(오프라인) 운영 권한 — 온라인 관리 전용 역할은 입퇴실·좌석·휴대폰 화면을 쓸 수 없다 */
export function useOfflineOpsAllowed() {
  const { session } = useSession();
  const caps = session?.capabilities;
  // 세션 로딩 중에는 막지 않는다 (서버가 최종 판단: requireMobileStaff)
  return !caps || !isStaffCapabilities(caps) || caps.offlineOps;
}

/** 권한 없을 때 보여 줄 화면 */
export function OfflineOpsLocked({ title, kind = 'push' }: { title: string; kind?: 'push' | 'tab' }) {
  return (
    <Screen kind={kind} title={title}>
      <EmptyState
        icon={Lock}
        title="자습실 운영진만 쓸 수 있어요"
        description="입퇴실·좌석·휴대폰 제출 관리는 자습실 운영 권한이 있어야 볼 수 있어요."
      />
    </Screen>
  );
}
