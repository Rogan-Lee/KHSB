import { Stack } from 'expo-router';

import { color } from '@/design';

/**
 * 로그인·초대 가입 스택.
 *  · index  — 로그인 / 초대 가입
 *  · invite — 딥링크 studyroom://invite?token=… → index 로 토큰 전달
 *  · sign-up — 유니버설 링크 https://…/sign-up?token=… → index 로 토큰 전달
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.bg.layerDefault },
        animation: 'fade',
      }}
    />
  );
}
