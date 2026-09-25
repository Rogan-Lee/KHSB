// 캘린더 도메인 색 — 일정 카드 색(CalendarEvent.color) → SEED 톤. 한곳에서만 정의한다.
//  · 저장값(color)은 그대로 두고 화면에서만 SEED 팔레트로 옮긴다.
//  · 칩: 옅은 배경(100) + 같은 색 글자(800). 견본: 진한 색(500).
//  · SEED 팔레트에 없는 옛 색(pink·brown)은 가까운 색(purple·yellow)으로 그린다.
//  · Google 에서 가져온 일정은 정보색(informative)으로 구분한다.

export type EventTone = {
  label: string;
  /** 칩·카드 배경 + 글자 */
  chip: string;
  /** 견본·점 */
  swatch: string;
};

const TONES = {
  gray: { label: "회색", chip: "bg-bg-neutral-weak text-fg-neutral-muted", swatch: "bg-palette-gray-600" },
  red: { label: "빨강", chip: "bg-palette-red-100 text-palette-red-800", swatch: "bg-palette-red-500" },
  orange: { label: "주황", chip: "bg-palette-carrot-100 text-palette-carrot-800", swatch: "bg-palette-carrot-500" },
  yellow: { label: "노랑", chip: "bg-palette-yellow-100 text-palette-yellow-900", swatch: "bg-palette-yellow-500" },
  green: { label: "초록", chip: "bg-palette-green-100 text-palette-green-800", swatch: "bg-palette-green-500" },
  blue: { label: "파랑", chip: "bg-palette-blue-100 text-palette-blue-800", swatch: "bg-palette-blue-500" },
  purple: { label: "보라", chip: "bg-palette-purple-100 text-palette-purple-800", swatch: "bg-palette-purple-500" },
  google: { label: "Google", chip: "bg-bg-informative-weak text-fg-informative", swatch: "bg-bg-informative-solid" },
} satisfies Record<string, EventTone>;

export type EventColorKey = keyof typeof TONES;

const ALIAS: Record<string, EventColorKey> = { pink: "purple", brown: "yellow" };

/** 색 선택지 (저장 값 = key). google 은 자동 지정이라 선택지에서 뺀다 */
export const EVENT_COLOR_OPTIONS: EventColorKey[] = ["gray", "red", "orange", "yellow", "green", "blue", "purple"];

export function normalizeEventColor(color: string | null | undefined, fallback: EventColorKey): EventColorKey {
  if (!color) return fallback;
  if (color in TONES) return color as EventColorKey;
  return ALIAS[color] ?? fallback;
}

export function eventTone(color: string | null | undefined, fallback: EventColorKey): EventTone {
  return TONES[normalizeEventColor(color, fallback)];
}

export function eventToneByKey(key: EventColorKey): EventTone {
  return TONES[key];
}

/** 요일 글자색 — 일요일 빨강, 토요일 파랑 */
export function weekdayTextClass(dow: number): string {
  if (dow === 0) return "text-fg-critical";
  if (dow === 6) return "text-fg-informative";
  return "text-fg-neutral-subtle";
}
