import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { color as C, text, type TextVariant } from './tokens';

export type FgColor = keyof typeof C.fg | 'staticWhite';

export type TextProps = RNTextProps & {
  /** SEED 텍스트 스타일 — 웹 `t5-medium` 과 같은 이름. 기본 t5-regular */
  variant?: TextVariant;
  /** SEED fg 토큰 이름(neutral, neutralSubtle, brand …) 또는 임의 색 */
  color?: FgColor | (string & {});
  /** 숫자 폭 고정 (웹 tabular-nums) */
  tabular?: boolean;
  align?: 'left' | 'center' | 'right';
};

function resolveColor(c: TextProps['color']): string {
  if (!c) return C.fg.neutral;
  if (c === 'staticWhite') return C.palette.staticWhite;
  return (C.fg as Record<string, string>)[c] ?? c;
}

/**
 * SEED 타이포 텍스트. 웹처럼 글자 크기 배율은 최대 1.5배까지만 따른다(SEED font-size-limit-max).
 */
export function Text({ variant = 't5-regular', color, tabular, align, style, ...rest }: TextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={1.5}
      {...rest}
      style={[
        text(variant),
        { color: resolveColor(color) },
        tabular && { fontVariant: ['tabular-nums'] },
        align && { textAlign: align },
        style,
      ]}
    />
  );
}
