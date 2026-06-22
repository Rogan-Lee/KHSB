import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { RemotePushRegistration } from '@/components/remote-push-registration';
import { colors } from '@/constants/theme';
import { useNotificationRouting } from '@/lib/notifications';
import { SessionProvider } from '@/lib/session';

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

  return (
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
  );
}
