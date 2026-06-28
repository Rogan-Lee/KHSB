import { Platform, TextStyle, ViewStyle } from 'react-native';

/**
 * Wanted Design System — mobile token port.
 * Primitives + semantic aliases mirrored from the KHSB 하이파이 design comp.
 * Higher number = darker. Blue-50 (#0066ff) is the brand primary.
 */

// ──────────────────────────────────────────────────────────
// Primitive ramps
// ──────────────────────────────────────────────────────────
export const palette = {
  blue90: '#001536', blue70: '#003e9c', blue60: '#0054d1', blue55: '#005eeb',
  blue50: '#0066ff', blue40: '#3385ff', blue30: '#69a5ff', blue20: '#9ec5ff',
  blue10: '#c9defe', blue5: '#eaf2fe', blue1: '#f7fbff',

  neutral90: '#171719', neutral85: '#1b1c1e', neutral80: '#212225', neutral70: '#2e2f33',
  neutral60: '#37383c', neutral50: '#46474c', neutral40: '#5a5c63', neutral30: '#70737c',
  neutral25: '#878a93', neutral20: '#989ba2', neutral15: '#aeb0b6', neutral10: '#c2c4c8',
  neutral7: '#dbdcdf', neutral5: '#e1e2e4', neutral3: '#eaebec', neutral2: '#f4f4f5', neutral1: '#f7f7f8',

  gray50: '#6d7882', gray40: '#8a949e', gray30: '#b1b8be', gray10: '#e6e8ea', gray5: '#f4f5f6',

  green70: '#007948', green60: '#00985a', green50: '#00a260', green40: '#00b66c',
  green30: '#b0efd5', green20: '#d9f7eb', green10: '#e6faf2',

  red60: '#e52222', red50: '#ff4242', red40: '#ff6363', red20: '#ffb5b5', red10: '#fed5d5', red5: '#feecec',

  redOrange50: '#ff5e00', redOrange40: '#ff7b2e', redOrange20: '#ffbd96', redOrange10: '#fed9c4', redOrange5: '#feeee5',

  orange60: '#d47800', orange50: '#ff9200', orange40: '#ffa938', orange20: '#ffd49c', orange10: '#fee6c6', orange5: '#fef4e6',

  violet60: '#4f29e5', violet50: '#6541f2', violet40: '#7d5ef7', violet30: '#9e86fc',
  violet20: '#c0b0ff', violet10: '#dbd3fe', violet5: '#f0ecfe',

  info50: '#0b78cb', info40: '#2098f3', info10: '#d3ebfd', info5: '#e7f4fe',
  lightBlue50: '#00aeff', lightBlue5: '#e5f6fe',
  pink50: '#ec166a', pink5: '#fde8f0',

  white: '#ffffff', black: '#030303',
} as const;

// translucent neutral base (#70737c) — lines & fills
const N = '112, 115, 124';

// ──────────────────────────────────────────────────────────
// Semantic colors (light mode) + backward-compatible aliases
// ──────────────────────────────────────────────────────────
export const colors = {
  // text
  textStrong: palette.black,
  textNormal: palette.neutral90,
  textAlternative: palette.neutral50,
  textAssistive: palette.neutral25,
  textDisabled: palette.gray30,
  textPrimary: palette.blue50,
  textOncolor: palette.white,

  // surfaces
  surface: palette.white,
  bgAlternative: palette.neutral1, // #f7f7f8 — screen body
  bgSunken: palette.gray5, // #f4f5f6

  // lines / fills (translucent neutral)
  line: palette.neutral5, // opaque hairline for RN borders
  lineNeutral: `rgba(${N}, 0.16)`,
  lineStrong: `rgba(${N}, 0.22)`,
  lineAlt: `rgba(${N}, 0.12)`,
  fill: `rgba(${N}, 0.08)`,
  fillStrong: `rgba(${N}, 0.16)`,
  fillAlt: `rgba(${N}, 0.05)`,

  // brand
  primary: palette.blue50,
  primaryStrong: palette.blue60,
  primarySurface: palette.blue5,

  // status
  positive: palette.green50,
  negative: palette.red50,
  warning: palette.orange50,
  info: palette.info50,

  // accents (role / point)
  green: palette.green50,
  redOrange: palette.redOrange50,
  lightBlue: palette.lightBlue50,
  pink: palette.pink50,

  // dark card
  inkCard: palette.neutral90,

  // ── backward-compatible aliases (do not remove — used widely) ──
  ink: palette.neutral90,
  muted: palette.neutral25,
  canvas: palette.neutral1,
  blue: palette.blue50,
  blueSoft: palette.blue5,
  primarySoft: palette.blue5,
  amber: palette.orange50,
  amberSoft: palette.orange5,
  red: palette.red50,
  redSoft: palette.red5,
  violet: palette.violet50,
  violetSoft: palette.violet5,
} as const;

// ──────────────────────────────────────────────────────────
// Role accent — student/staff/director = blue, consultant/manager = violet, parent = green
// ──────────────────────────────────────────────────────────
export type Role = 'student' | 'staff' | 'director' | 'consultant' | 'manager' | 'parent';
export const roleAccent: Record<Role, { color: string; surface: string }> = {
  student: { color: palette.blue50, surface: palette.blue5 },
  staff: { color: palette.blue50, surface: palette.blue5 },
  director: { color: palette.blue50, surface: palette.blue5 },
  consultant: { color: palette.violet50, surface: palette.violet5 },
  manager: { color: palette.violet50, surface: palette.violet5 },
  parent: { color: palette.green50, surface: palette.green10 },
};

// ──────────────────────────────────────────────────────────
// Tones — tinted badge / pill backgrounds (bg + fg)
// ──────────────────────────────────────────────────────────
export type Tone =
  | 'primary' | 'blue' | 'positive' | 'negative' | 'warning'
  | 'violet' | 'info' | 'neutral'
  // legacy aliases
  | 'amber' | 'red';

export const tones: Record<Tone, { background: string; foreground: string }> = {
  primary: { background: palette.blue5, foreground: palette.blue50 },
  blue: { background: palette.blue5, foreground: palette.blue50 },
  positive: { background: palette.green20, foreground: palette.green60 },
  negative: { background: palette.red5, foreground: palette.red60 },
  warning: { background: palette.orange5, foreground: palette.orange60 },
  violet: { background: palette.violet5, foreground: palette.violet50 },
  info: { background: palette.info5, foreground: palette.info50 },
  neutral: { background: `rgba(${N}, 0.10)`, foreground: palette.neutral50 },
  // legacy aliases
  amber: { background: palette.orange5, foreground: palette.orange60 },
  red: { background: palette.red5, foreground: palette.red60 },
};

// ──────────────────────────────────────────────────────────
// Spacing (kept) + radius
// ──────────────────────────────────────────────────────────
export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
} as const;

export const radius = {
  sm: 2, md: 4, md2: 6, lg: 8, xl: 12, xxl: 16, xxxl: 20, full: 1000,
} as const;

// ──────────────────────────────────────────────────────────
// Elevation — soft, low-contrast (RN shadow objects)
// ──────────────────────────────────────────────────────────
export const shadow: Record<'xs' | 'sm' | 'card' | 'lg' | 'float', ViewStyle> = {
  xs: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  sm: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  card: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  lg: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  float: { shadowColor: '#000', shadowOpacity: 0.13, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
};

// ──────────────────────────────────────────────────────────
// Typography — Wanted DS named scale.
// Pretendard falls back to the platform Korean UI face until the
// webfont is bundled via expo-font (follow-up polish).
// ──────────────────────────────────────────────────────────
export const fontFamily = Platform.select({ ios: undefined, default: undefined });

type TypeStyle = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing'>;

export const type = {
  title1: { fontSize: 28, lineHeight: 38, fontWeight: '700', letterSpacing: -0.62 },
  title2: { fontSize: 24, lineHeight: 32, fontWeight: '700', letterSpacing: -0.53 },
  title3: { fontSize: 22, lineHeight: 30, fontWeight: '700', letterSpacing: -0.44 },
  heading1: { fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4 },
  heading2: { fontSize: 18, lineHeight: 25, fontWeight: '600', letterSpacing: -0.34 },
  headline: { fontSize: 17, lineHeight: 24, fontWeight: '600', letterSpacing: -0.3 },
  body1: { fontSize: 16, lineHeight: 24, fontWeight: '400', letterSpacing: -0.18 },
  body2: { fontSize: 15, lineHeight: 23, fontWeight: '400', letterSpacing: -0.15 },
  body3: { fontSize: 14, lineHeight: 21, fontWeight: '400', letterSpacing: -0.1 },
  label1: { fontSize: 15, lineHeight: 21, fontWeight: '600', letterSpacing: -0.15 },
  label2: { fontSize: 14, lineHeight: 20, fontWeight: '600', letterSpacing: -0.1 },
  caption1: { fontSize: 13, lineHeight: 18, fontWeight: '500', letterSpacing: -0.05 },
  caption2: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0 },
} satisfies Record<string, TypeStyle>;
