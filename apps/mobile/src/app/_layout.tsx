import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';

import { RemotePushRegistration } from '@/components/remote-push-registration';
import { colors } from '@/constants/theme';
import { useNotificationRouting } from '@/lib/notifications';
import { SessionProvider } from '@/lib/session';

// 스플래시 자동 숨김 방지 → 최소 노출 시간 동안 로고를 보여준 뒤 직접 숨긴다.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 300, fade: true });

const SPLASH_MIN_VISIBLE_MS = 1000;

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.canvas,
    border: colors.line,
    card: colors.surface,
    primary: colors.primary,
    text: colors.ink,
  },
};

export default function RootLayout() {
  useNotificationRouting();

  useEffect(() => {
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, SPLASH_MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SessionProvider>
          <RemotePushRegistration />
          <ThemeProvider value={navigationTheme}>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(student)" />
              <Stack.Screen name="(staff)" />
              <Stack.Screen name="notifications" />
            </Stack>
          </ThemeProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
