import { Redirect, Stack } from 'expo-router';

import { color } from '@/design';
import { useSession } from '@/lib/session';

/** student — 탭 루트((tabs)) 위에 하위 화면을 쌓는 스택. 하위 화면은 탭바 없이 뒤로가기 헤더(Screen kind="push"). */
export default function RoleLayout() {
  const { session, status } = useSession();

  if (status !== 'loading' && session?.role !== 'student') {
    return <Redirect href="/(auth)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.bg.layerBasement },
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
