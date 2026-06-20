import { CircleAlert, ChevronRight, Inbox, LucideIcon } from 'lucide-react-native';
import { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { colors, spacing } from '@/constants/theme';

type Tone = 'primary' | 'blue' | 'amber' | 'red' | 'violet';

const tones = {
  primary: { background: colors.primarySoft, foreground: colors.primary },
  blue: { background: colors.blueSoft, foreground: colors.blue },
  amber: { background: colors.amberSoft, foreground: colors.amber },
  red: { background: colors.redSoft, foreground: colors.red },
  violet: { background: colors.violetSoft, foreground: colors.violet },
};

export function SectionTitle({ action, children }: PropsWithChildren<{ action?: ReactNode }>) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ children, tone = 'primary' }: PropsWithChildren<{ tone?: Tone }>) {
  return (
    <View style={[styles.badge, { backgroundColor: tones[tone].background }]}>
      <Text style={[styles.badgeText, { color: tones[tone].foreground }]}>{children}</Text>
    </View>
  );
}

export function StatCard({
  caption,
  tone,
  value,
}: {
  caption: string;
  tone: Tone;
  value: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: tones[tone].background }]}>
      <Text style={[styles.statValue, { color: tones[tone].foreground }]}>{value}</Text>
      <Text style={styles.statCaption}>{caption}</Text>
    </View>
  );
}

export function ActionRow({
  caption,
  icon: Icon,
  onPress,
  right,
  title,
  tone = 'primary',
}: {
  caption?: string;
  icon: LucideIcon;
  onPress?: PressableProps['onPress'];
  right?: ReactNode;
  title: string;
  tone?: Tone;
}) {
  const content = (
    <>
      <View style={[styles.iconBox, { backgroundColor: tones[tone].background }]}>
        <Icon color={tones[tone].foreground} size={20} strokeWidth={2.2} />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.actionTitle}>{title}</Text>
        {caption ? <Text style={styles.actionCaption}>{caption}</Text> : null}
      </View>
      {right ?? (onPress ? <ChevronRight color={colors.muted} size={18} /> : null)}
    </>
  );

  if (!onPress) {
    return <View style={styles.actionRow}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

export function PrimaryButton({
  children,
  disabled,
  onPress,
  variant = 'primary',
}: PropsWithChildren<{
  disabled?: boolean;
  onPress?: PressableProps['onPress'];
  variant?: 'primary' | 'secondary' | 'danger';
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.secondaryButton,
        variant === 'danger' && styles.dangerButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.buttonText, variant === 'secondary' && styles.secondaryButtonText]}>
        {children}
      </Text>
    </Pressable>
  );
}

export function LoadingState({ label = '불러오는 중' }: { label?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.state}>
      <CircleAlert color={colors.red} size={24} />
      <Text style={styles.stateTitle}>데이터를 불러오지 못했습니다</Text>
      <Text style={styles.stateText}>{message}</Text>
      <PrimaryButton onPress={onRetry} variant="secondary">
        다시 시도
      </PrimaryButton>
    </View>
  );
}

export function EmptyState({
  message,
  title = '표시할 내용이 없습니다',
}: {
  message?: string;
  title?: string;
}) {
  return (
    <View style={styles.state}>
      <Inbox color={colors.muted} size={24} />
      <Text style={styles.stateTitle}>{title}</Text>
      {message ? <Text style={styles.stateText}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statCard: {
    borderRadius: 8,
    flex: 1,
    minHeight: 88,
    padding: spacing.md,
  },
  statValue: {
    fontSize: 25,
    fontWeight: '800',
  },
  statCaption: {
    color: colors.muted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBox: {
    alignItems: 'center',
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  actionText: {
    flex: 1,
    gap: 3,
  },
  actionTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  actionCaption: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  secondaryButton: {
    backgroundColor: colors.primarySoft,
  },
  dangerButton: {
    backgroundColor: colors.red,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButtonText: {
    color: colors.primary,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
  },
  state: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 180,
    padding: spacing.xl,
  },
  stateTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
