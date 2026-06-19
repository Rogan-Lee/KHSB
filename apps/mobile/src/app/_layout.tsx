import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/constants/theme';
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
  return (
    <SessionProvider>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(student)" />
          <Stack.Screen name="(staff)" />
        </Stack>
      </ThemeProvider>
    </SessionProvider>
  );
}
