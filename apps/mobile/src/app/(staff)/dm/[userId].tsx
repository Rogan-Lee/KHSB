import { useLocalSearchParams } from 'expo-router';

import { DmThread } from '@/features/staff-inbox/dm-thread';

/** 직원 1:1 메시지 — 소통 탭 > 직원 DM 에서 진입 (태블릿은 소통 탭 오른쪽 패널) */
export default function StaffDmScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  return <DmThread userId={String(userId)} />;
}
