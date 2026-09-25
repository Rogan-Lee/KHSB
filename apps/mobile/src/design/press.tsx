import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { color } from './tokens';

export type PressProps = Omit<PressableProps, 'style' | 'children'> & {
  /** 눌렀을 때 줄어드는 비율 — SEED scale feedback(0.98). 0 이면 끔 */
  scale?: number;
  /** 눌림 배경 (SEED bg.transparent-pressed) — 리스트 행처럼 배경이 없는 요소용 */
  pressedBg?: boolean | string;
  /** 누르면 이동할 경로 (expo-router) */
  href?: Href;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * 눌림 피드백이 있는 Pressable — 웹 포털 PRESS(active:scale-[0.98]) 와 같은 감각.
 * style 은 Pressable 자체에 적용된다(flex·margin·width 등 레이아웃이 그대로 동작, 웹·네이티브 동일).
 */
export function Press({
  scale = 0.98,
  pressedBg = false,
  href,
  onPress,
  style,
  children,
  ...rest
}: PressProps) {
  const router = useRouter();

  const handlePress = (e: GestureResponderEvent) => {
    onPress?.(e);
    if (href) router.push(href);
  };

  const bg = pressedBg === true ? color.bg.transparentPressed : pressedBg || undefined;

  return (
    <Pressable
      // 웹은 role=button 이면 <button> 을 그려서, 안에 버튼이 든 행(목록 행 + 입실 버튼 등)이
      // <button> 중첩(잘못된 HTML)이 된다 → 웹에서는 기본 역할을 비워 둔다(Button 은 명시적으로 button)
      accessibilityRole={
        rest.accessibilityRole ?? (href ? 'link' : Platform.OS === 'web' ? undefined : 'button')
      }
      onPress={handlePress}
      {...rest}
      style={({ pressed }) => [
        style,
        pressed && scale ? { transform: [{ scale }] } : null,
        pressed && bg ? { backgroundColor: bg } : null,
      ]}>
      {children}
    </Pressable>
  );
}
