import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { Screen } from '@/design';
import { OfflineOpsLocked, useOfflineOpsAllowed } from '@/features/staff-ops/access';
import { rememberStudent } from '@/features/staff-ops/recent-students';
import {
  isProfileTab,
  StudentProfileBody,
  useStudentProfile,
} from '@/features/staff-ops/student-profile';
import { useResponsive } from '@/lib/responsive';

/** 학생 프로필 — 헤더·빠른 연락·오늘 출결·탭(정보·출결·상벌점·과제·성적·요청) */
export default function StaffStudentProfileScreen() {
  const allowed = useOfflineOpsAllowed();
  if (!allowed) return <OfflineOpsLocked title="학생" />;
  return <StudentProfileRoute />;
}

function StudentProfileRoute() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { isTablet } = useResponsive();
  const query = useStudentProfile(id);
  const info = query.data?.info;

  // 최근 본 학생에 남긴다 (검색 화면 '최근 본 학생')
  useEffect(() => {
    if (info) void rememberStudent({ id: info.id, name: info.name, grade: info.grade, seat: info.seat });
  }, [info]);

  return (
    <Screen
      kind="push"
      title={info?.name ?? '학생'}
      backFallback="/(staff)/students"
      maxWidth={isTablet ? 720 : undefined}
      refreshing={query.isRefreshing}
      onRefresh={() => void query.refresh()}>
      <StudentProfileBody query={query} initialTab={isProfileTab(tab) ? tab : 'info'} />
    </Screen>
  );
}
