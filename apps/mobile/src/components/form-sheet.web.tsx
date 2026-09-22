import { X } from 'lucide-react-native';
import { PropsWithChildren } from 'react';
import { createPortal } from 'react-dom';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';

export function FormSheet({
  children,
  inline = false,
  onClose,
  subtitle,
  title,
  visible,
}: PropsWithChildren<{
  /** true 면 fixed 오버레이 대신 부모 레이아웃(예: TwoPane 디테일 패널) 안에 렌더 */
  inline?: boolean;
  onClose: () => void;
  subtitle?: string;
  title: string;
  visible: boolean;
}>) {
  if (!visible || typeof document === 'undefined') return null;

  const body = (
    <>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Pressable
          accessibilityLabel="닫기"
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
          <X color={colors.ink} size={22} />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}>
        {children}
      </ScrollView>
    </>
  );

  if (inline) {
    return (
      <div style={{ background: colors.canvas, display: 'flex', flex: 1, flexDirection: 'column' }}>
        {body}
      </div>
    );
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        background: colors.canvas,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        left: 0,
        position: 'fixed',
        right: 0,
        top: 0,
        zIndex: 1000,
      }}>
      {body}
    </div>,
    document.body,
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  heading: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  closeButton: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  content: {
    gap: spacing.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  scroll: {
    flex: 1,
  },
  pressed: {
    opacity: 0.72,
  },
});
