import { X } from 'lucide-react-native';
import { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/constants/theme';

export function FormSheet({
  children,
  inline = false,
  onClose,
  subtitle,
  title,
  visible,
}: PropsWithChildren<{
  /** true 면 Modal 대신 부모 레이아웃(예: TwoPane 디테일 패널) 안에 렌더 */
  inline?: boolean;
  onClose: () => void;
  subtitle?: string;
  title: string;
  visible: boolean;
}>) {
  // Modal 은 SafeAreaProvider 밖 별도 계층에 렌더되므로 native SafeAreaView 의
  // inset 이 0 이 된다(닫기 버튼이 상태바 밑에 깔림). 부모 트리에서 읽은 inset 을
  // 직접 패딩으로 적용한다.
  const insets = useSafeAreaInsets();
  const body = (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Pressable
          accessibilityLabel="닫기"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onClose}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
          <X color={colors.ink} size={22} />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (inline) {
    if (!visible) return null;
    return (
      <View style={[styles.safeArea, { paddingTop: Math.max(insets.top, 12) }]}>{body}</View>
    );
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}>
      <View
        style={[
          styles.safeArea,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: insets.bottom,
          },
        ]}>
        {body}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
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
  pressed: {
    opacity: 0.72,
  },
});
