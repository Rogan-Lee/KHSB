import type { TextStyle, ViewStyle } from 'react-native';

import {
  seedColor,
  seedDimension,
  seedDuration,
  seedFontSize,
  seedFontWeight,
  seedLineHeight,
  seedRadius,
  seedShadow,
} from './seed-tokens';

/**
 * SEED Design 토큰 — 웹 학생 포털(Tailwind `bg-bg-layer-default`, `t5-medium`, `p-x4` …)과 1:1 대응.
 *   웹 `bg-bg-brand-solid`      → color.bg.brandSolid
 *   웹 `text-fg-neutral-subtle` → color.fg.neutralSubtle
 *   웹 `border-stroke-neutral-subtle` → color.stroke.neutralSubtle
 *   웹 `p-x4` / `gap-x3`         → space.x4 / space.x3
 *   웹 `rounded-r4`              → radius.r4
 *   웹 `t5-medium`               → text('t5-medium')
 */
export const color = seedColor;
export const space = seedDimension;
export const radius = seedRadius;
export const duration = seedDuration;

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
type Weight = keyof typeof seedFontWeight;
export type TextVariant = `t${Step}-${Weight}` | 'screen-title';

const cache = new Map<TextVariant, TextStyle>();

/** SEED 텍스트 스타일 (fontSize·lineHeight·fontWeight) */
export function text(variant: TextVariant): TextStyle {
  const hit = cache.get(variant);
  if (hit) return hit;
  const [step, weight] =
    variant === 'screen-title' ? (['t10', 'bold'] as const) : (variant.split('-') as [string, Weight]);
  const style: TextStyle = {
    fontSize: seedFontSize[step as keyof typeof seedFontSize],
    lineHeight: seedLineHeight[step as keyof typeof seedLineHeight],
    fontWeight: seedFontWeight[weight] as TextStyle['fontWeight'],
  };
  cache.set(variant, style);
  return style;
}

/** SEED 그림자 s1(카드) · s2(떠 있는 요소) · s3(시트) — RN boxShadow(웹 CSS 와 같은 문법) */
export function shadow(level: keyof typeof seedShadow): ViewStyle {
  const s = seedShadow[level];
  return {
    boxShadow: `${s.offsetX}px ${s.offsetY}px ${s.radius}px 0px rgba(0, 0, 0, ${s.opacity})`,
  };
}

/** 가는 구분선 두께 */
export const hairline = 1;

/** 콘텐츠 최대 폭 — 웹 포털 max-w-[480px] 과 동일 (iPad 에서도 폰 레이아웃 유지) */
export const CONTENT_MAX_WIDTH = 480;

// ─── Tone ────────────────────────────────────────────────────────────
// 웹 src/components/portal/ui.tsx 의 Tone 과 같은 이름·매핑.

export type Tone = 'gray' | 'brand' | 'ok' | 'warn' | 'bad' | 'info' | 'violet';

/** 약한 배경 + 역할 전경색 (SEED bg.*-weak / fg.*) */
export const TONE_SOFT: Record<Tone, { bg: string; fg: string }> = {
  gray: { bg: color.bg.neutralWeak, fg: color.fg.neutralMuted },
  brand: { bg: color.bg.brandWeak, fg: color.fg.brand },
  ok: { bg: color.bg.positiveWeak, fg: color.fg.positive },
  warn: { bg: color.bg.warningWeak, fg: color.fg.warning },
  bad: { bg: color.bg.criticalWeak, fg: color.fg.critical },
  info: { bg: color.bg.informativeWeak, fg: color.fg.informative },
  violet: { bg: color.palette.purple100, fg: color.palette.purple700 },
};

/** 강한 배경 (SEED bg.*-solid) */
export const TONE_SOLID: Record<Tone, { bg: string; fg: string }> = {
  gray: { bg: color.bg.neutralSolid, fg: color.fg.neutralInverted },
  brand: { bg: color.bg.brandSolid, fg: color.palette.staticWhite },
  ok: { bg: color.bg.positiveSolid, fg: color.palette.staticWhite },
  warn: { bg: color.bg.warningSolid, fg: color.fg.neutral },
  bad: { bg: color.bg.criticalSolid, fg: color.palette.staticWhite },
  info: { bg: color.bg.informativeSolid, fg: color.palette.staticWhite },
  violet: { bg: color.palette.purple600, fg: color.palette.staticWhite },
};

/** 안내 박스(Callout) 톤 — SEED callout: 약한 배경 + contrast 전경 */
export const TONE_CALLOUT: Record<Tone, { bg: string; fg: string }> = {
  gray: { bg: color.bg.neutralWeak, fg: color.fg.neutral },
  brand: { bg: color.bg.neutralWeak, fg: color.fg.neutral },
  ok: { bg: color.bg.positiveWeak, fg: color.fg.positiveContrast },
  warn: { bg: color.bg.warningWeak, fg: color.fg.warningContrast },
  bad: { bg: color.bg.criticalWeak, fg: color.fg.criticalContrast },
  info: { bg: color.bg.informativeWeak, fg: color.fg.informativeContrast },
  violet: { bg: color.bg.informativeWeak, fg: color.fg.informativeContrast },
};
