import { PropsWithChildren, ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/constants/theme';

type AppScreenProps = PropsWithChildren<{
  eyebrow?: string;
  eyebrowMuted?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  right?: ReactNode;
  subtitle?: string;
  title: string;
}>;

export function AppScreen({
  children,
  eyebrow,
  eyebrowMuted = false,
  onRefresh,
  refreshing = false,
  right,
  subtitle,
  title,
}: AppScreenProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              colors={[colors.primary]}
              onRefresh={onRefresh}
              refreshing={refreshing}
              tintColor={colors.primary}
            />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.heading}>
            {eyebrow ? (
              <Text style={[styles.eyebrow, eyebrowMuted && styles.eyebrowMuted]}>{eyebrow}</Text>
            ) : null}
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: 36,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  heading: {
    flex: 1,
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  eyebrowMuted: {
    color: colors.textAssistive,
    fontWeight: '500',
  },
  title: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
});
