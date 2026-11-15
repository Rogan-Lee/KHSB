import { useEffect } from 'react';

import { Screen } from '@/design';
import { FamilyChatThread } from '@/features/family-chat/thread';
import { refreshBadges } from '@/lib/badges';

/** 학생 가족 톡방 — 메시지 탭 맨 위 "가족 톡방" 에서 들어온다 (태블릿은 메시지 탭 오른쪽 패널) */
export default function StudentFamilyChatScreen() {
  // 열면 서버가 읽음 처리 — 나갈 때도 탭 배지 갱신
  useEffect(() => () => refreshBadges(), []);
  return (
    <Screen kind="push" title="가족 톡방" scroll={false} maxWidth={0} backFallback="/(student)/(tabs)/chat">
      <FamilyChatThread audience="student" />
    </Screen>
  );
}
