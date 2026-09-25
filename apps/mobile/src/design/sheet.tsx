import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedbackHost } from './feedback';
import { ScreenHeader } from './screen';
import { Text } from './text';
import { color, CONTENT_MAX_WIDTH, radius, shadow, space } from './tokens';

/**
 * SEED BottomSheet — 확인·짧은 작성용. 핸들 · 제목 t7-bold · 설명 · 본문 · 하단 버튼(footer).
 * 웹 src/components/portal/bottom-sheet.tsx 와 같은 API.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** 하단 버튼들 (폭을 나눠 가짐) */
  footer?: ReactNode;
  dismissible?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const [t] = useState(() => new Animated.Value(0));
  // 열리면 즉시 마운트(렌더 중 파생 상태), 닫힐 때는 애니메이션이 끝난 뒤 언마운트
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) {
      Animated.timing(t, {
        toValue: 1,
        duration: 260,
        easing: Easing.bezier(0.03, 0.4, 0.1, 1),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(t, {
      toValue: 0,
      duration: 180,
      easing: Easing.bezier(0.35, 0, 1, 1),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [open, t]);

  if (!mounted) return null;

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={() => dismissible && onClose()}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.bg.overlay, opacity: t }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismissible && onClose()} accessibilityLabel="닫기" />
      </Animated.View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
        style={s.sheetWrap}
        pointerEvents="box-none">
        <Animated.View
          style={[
            s.sheet,
            {
              maxHeight: height * 0.9,
              paddingBottom: Math.max(insets.bottom, space.x4),
              transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [height * 0.6, 0] }) }],
            },
          ]}>
          <View style={s.handle} />
          {(title != null || description != null) && (
            <View style={s.head}>
              {title != null && (typeof title === 'string' ? <Text variant="t7-bold">{title}</Text> : title)}
              {description != null &&
                (typeof description === 'string' ? (
                  <Text variant="t5-regular" color="neutralMuted">
                    {description}
                  </Text>
                ) : (
                  description
                ))}
            </View>
          )}
          {children != null && (
            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={s.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          )}
          {footer != null && <View style={s.footer}>{footer}</View>}
        </Animated.View>
      </KeyboardAvoidingView>
      {/* 시트 위에서 띄운 confirm·toast 는 이 Modal 안에 그린다 (iOS 는 Modal 위에 Modal 을 못 띄움) */}
      <FeedbackHost bottomOffset={Math.max(insets.bottom, space.x4) + space.x16} />
    </Modal>
  );
}

/**
 * 전체 화면 시트 — 긴 작성·상세(과제 제출, 멘토링 기록 등). 헤더: 닫기(X) + 가운데 제목.
 * inline=true 면 Modal 대신 부모(TwoPane 디테일 패널) 안에 렌더 — 기존 FormSheet 와 같은 API.
 */
export function FullSheet({
  visible,
  onClose,
  title,
  subtitle,
  inline = false,
  surface = 'panel',
  footer,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  inline?: boolean;
  surface?: 'panel' | 'canvas';
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const bg = surface === 'panel' ? color.bg.layerDefault : color.bg.layerBasement;
  const body = (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScreenHeader kind="modal" title={title} onBack={onClose} background={bg} maxWidth={0} />
      <KeyboardAvoidingView behavior={Platform.OS === 'web' ? undefined : 'padding'} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: space.x4,
            paddingBottom: (footer ? 0 : Math.max(insets.bottom, space.x4)) + space.x6,
          }}>
          <View style={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH + 160, alignSelf: 'center', gap: space.x4 }}>
            {subtitle != null && (
              <Text variant="t4-regular" color="neutralSubtle">
                {subtitle}
              </Text>
            )}
            {children}
          </View>
        </ScrollView>
        {footer != null && (
          <View style={[s.fullFooter, { paddingBottom: Math.max(insets.bottom, space.x3), backgroundColor: bg }]}>
            {footer}
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );

  if (inline) return visible ? body : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {body}
      <FeedbackHost bottomOffset={Math.max(insets.bottom, space.x3) + (footer ? space.x16 + space.x4 : space.x4)} />
    </Modal>
  );
}

const s = StyleSheet.create({
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    backgroundColor: color.bg.layerFloating,
    borderTopLeftRadius: radius.r6,
    borderTopRightRadius: radius.r6,
    ...shadow('s3'),
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: space.x2,
    backgroundColor: color.palette.gray400,
  },
  head: { gap: space.x2, paddingHorizontal: space.x5, paddingTop: space.x4, paddingBottom: space.x2 },
  body: { paddingHorizontal: space.x5, paddingTop: space.x2, paddingBottom: space.x2, gap: space.x3 },
  footer: { flexDirection: 'row', gap: space.x2, paddingHorizontal: space.x5, paddingTop: space.x4 },
  fullFooter: {
    flexDirection: 'row',
    gap: space.x2,
    paddingHorizontal: space.x4,
    paddingTop: space.x3,
    borderTopWidth: 1,
    borderTopColor: color.stroke.neutralSubtle,
  },
});
