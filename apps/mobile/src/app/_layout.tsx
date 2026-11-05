import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Dimensions, Platform, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';

import { RemotePushRegistration } from '@/components/remote-push-registration';
import { color, FeedbackProvider, useStackAnimation } from '@/design';
import { TermsGate } from '@/features/safety/terms-gate';
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
    background: color.bg.layerBasement,
    border: color.stroke.neutralSubtle,
    card: color.bg.layerDefault,
    primary: color.bg.brandSolid,
    text: color.fg.neutral,
  },
};

/**
 * 앱 설정(app.json orientation)은 폰 기준 세로 고정이라, 안드로이드 태블릿(가장 짧은 변 600dp 이상)은
 * 여기서 회전을 풀어 준다. iPad 는 Info.plist 가 기기별로 갈려 있어(iPad 는 모든 방향) 할 일이 없다.
 * 태블릿 화면은 가로 우선으로 설계하되 세로·화면 분할에서도 깨지지 않게 만든다 — iPadOS 26 은 방향을 고정하면
 * 세로로 든 기기에서 화면을 줄여 위아래를 비우고, 안드로이드 16+ 큰 화면은 고정을 무시한다.
 */
function useAndroidOrientation() {
  useWindowDimensions(); // 접는 폰을 펴고 접을 때 다시 판단하도록 다시 그린다
  const screen = Dimensions.get('screen');
  const tablet = Math.min(screen.width, screen.height) >= 600;
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const done = tablet
      ? ScreenOrientation.unlockAsync()
      : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    done.catch(() => {});
  }, [tablet]);
}

export default function RootLayout() {
  useNotificationRouting();
  useAndroidOrientation();
  const stackAnimation = useStackAnimation();

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
            <FeedbackProvider>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: color.bg.layerBasement },
                }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(student)" />
                <Stack.Screen name="(staff)" />
                <Stack.Screen name="(parent)" />
                <Stack.Screen name="notifications" options={stackAnimation} />
                <Stack.Screen name="account" options={stackAnimation} />
                <Stack.Screen name="blocked-users" options={stackAnimation} />
              </Stack>
              <TermsGate />
            </FeedbackProvider>
          </ThemeProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
