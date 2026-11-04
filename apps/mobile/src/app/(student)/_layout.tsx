import { Redirect, Stack } from 'expo-router';

import { color, useStackAnimation } from '@/design';
import { StudentShell } from '@/features/nav/role-nav';
import { useSession } from '@/lib/session';

/** student — 탭 루트((tabs)) 위에 하위 화면을 쌓는 스택. 하위 화면은 탭바 없이 뒤로가기 헤더(Screen kind="push"). */
export default function RoleLayout() {
  const { session, status } = useSession();
  const stackAnimation = useStackAnimation();

  if (status !== 'loading' && session?.role !== 'student') {
    return <Redirect href="/(auth)" />;
  }

  // 태블릿: 사이드바가 스택을 감싸서 하위 화면에서도 남는다
  return (
    <StudentShell>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bg.layerBasement },
          ...stackAnimation,
        }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </StudentShell>
  );
}
