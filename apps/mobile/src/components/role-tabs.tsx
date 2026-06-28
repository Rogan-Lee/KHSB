import { Tabs } from 'expo-router';
import { LucideIcon } from 'lucide-react-native';
import { ReactNode } from 'react';
import { ColorValue } from 'react-native';

import { colors } from '@/constants/theme';

export function RoleTabs({ children }: { children: ReactNode }) {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 82,
          paddingBottom: 12,
          paddingTop: 8,
        },
      }}>
      {children}
    </Tabs>
  );
}

export function tabIcon(Icon: LucideIcon) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Icon color={color as string} size={size} strokeWidth={2.1} />;
  };
}
