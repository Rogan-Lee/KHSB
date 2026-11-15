import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Screen } from '@/design';
import { FamilyChatThread } from '@/features/family-chat/thread';
import { refreshBadges } from '@/lib/badges';

/** 학생 가족 톡방 — 소통 탭 > 가족에서 진입 (태블릿은 소통 탭 오른쪽 패널) */
export default function StaffFamilyChatScreen() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const [title, setTitle] = useState('가족 톡방');

  // 열면 서버가 읽음 처리 — 나갈 때도 탭 배지 갱신
  useEffect(() => () => refreshBadges(), []);

  return (
    <Screen kind="push" title={title} scroll={false} maxWidth={0} backFallback="/(staff)/(tabs)/inbox?tab=family">
      <FamilyChatThread
        audience="staff"
        studentId={String(studentId)}
        onMembers={(m) => setTitle(`${m.student.name} 가족 톡방`)}
      />
    </Screen>
  );
}
