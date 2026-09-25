// 시간표 도메인 색 — 한곳에서만 정의한다.
//  · 사용자가 고른 colorCode(DB 값)는 그대로 두고, 화면에서만 SEED 팔레트 톤으로 옮긴다.
//  · 블록: 옅은 배경(100) + 같은 색 경계(200) + 같은 색 글자(900/700). 견본·선택 표시는 진한 색(500).
//  · pink · teal 은 SEED 팔레트에 없어 purple · green 으로 그린다(저장값은 바뀌지 않음).
//  · 자동 블록(등원·외출)과 학교 일정은 의미색(positive · warning · critical · purple)을 쓴다.

export type TimetableTone = {
  /** 블록 배경 + 안쪽 경계선 */
  block: string;
  /** 블록 제목 글자 */
  title: string;
  /** 블록 보조 글자(메모·시각) */
  sub: string;
  /** 진한 색 — 견본·크기 조절 핸들·체크 아이콘 배경 */
  solid: string;
  /** 진한 색 글자 — 체크 아이콘 등 */
  fg: string;
  /** 선택 테두리 */
  ring: string;
};

const TONES = {
  blue: {
    block: "bg-palette-blue-100 ring-palette-blue-200",
    title: "text-palette-blue-900",
    sub: "text-palette-blue-700",
    solid: "bg-palette-blue-500",
    fg: "text-palette-blue-600",
    ring: "ring-palette-blue-500",
  },
  red: {
    block: "bg-palette-red-100 ring-palette-red-200",
    title: "text-palette-red-900",
    sub: "text-palette-red-700",
    solid: "bg-palette-red-500",
    fg: "text-palette-red-600",
    ring: "ring-palette-red-500",
  },
  orange: {
    block: "bg-palette-carrot-100 ring-palette-carrot-200",
    title: "text-palette-carrot-900",
    sub: "text-palette-carrot-700",
    solid: "bg-palette-carrot-500",
    fg: "text-palette-carrot-600",
    ring: "ring-palette-carrot-500",
  },
  yellow: {
    block: "bg-palette-yellow-100 ring-palette-yellow-300",
    title: "text-palette-yellow-900",
    sub: "text-palette-yellow-800",
    solid: "bg-palette-yellow-500",
    fg: "text-palette-yellow-700",
    ring: "ring-palette-yellow-600",
  },
  green: {
    block: "bg-palette-green-100 ring-palette-green-200",
    title: "text-palette-green-900",
    sub: "text-palette-green-700",
    solid: "bg-palette-green-500",
    fg: "text-palette-green-600",
    ring: "ring-palette-green-500",
  },
  purple: {
    block: "bg-palette-purple-100 ring-palette-purple-200",
    title: "text-palette-purple-900",
    sub: "text-palette-purple-700",
    solid: "bg-palette-purple-500",
    fg: "text-palette-purple-600",
    ring: "ring-palette-purple-500",
  },
} satisfies Record<string, TimetableTone>;

type ToneKey = keyof typeof TONES;

/** SEED 팔레트에 없는 옛 색 코드 → 가장 가까운 SEED 색 */
const ALIAS: Record<string, ToneKey> = { pink: "purple", teal: "green" };

/** 색 견본에 보여줄 선택지 (저장 값 = key) */
export const COLOR_OPTIONS: { key: ToneKey; label: string }[] = [
  { key: "blue", label: "파랑" },
  { key: "red", label: "빨강" },
  { key: "orange", label: "주황" },
  { key: "yellow", label: "노랑" },
  { key: "green", label: "초록" },
  { key: "purple", label: "보라" },
];

/** 저장된 colorCode 를 화면용 키로 정규화 (모르는 값은 파랑) */
export function normalizeColor(code: string | null | undefined): ToneKey {
  if (!code) return "blue";
  if (code in TONES) return code as ToneKey;
  return ALIAS[code] ?? "blue";
}

export function timetableTone(code: string | null | undefined): TimetableTone {
  return TONES[normalizeColor(code)];
}

/** 출결 일정에서 자동으로 들어온 블록 */
export const AUTO_BLOCK_TONE = {
  ATTENDANCE: {
    label: "등원",
    block: "bg-bg-positive-weak ring-stroke-positive-weak",
    fg: "text-fg-positive",
    dot: "bg-bg-positive-solid",
  },
  OUTING: {
    label: "외출",
    block: "bg-bg-warning-weak ring-stroke-warning-weak",
    fg: "text-fg-warning",
    dot: "bg-bg-warning-solid",
  },
} as const;

/** 학교 일정(읽기 전용) — 시험은 위험색, 그 밖의 행사는 보라 */
export function schoolEventTone(type: string): string {
  return type === "SCHOOL_EXAM"
    ? "bg-bg-critical-weak text-fg-critical ring-stroke-critical-weak"
    : "bg-palette-purple-100 text-palette-purple-700 ring-palette-purple-200";
}

/** 범례 — 블록 모양과 같은 견본 + 이름 */
export const LEGEND = [
  { label: "등원(자동)", swatch: AUTO_BLOCK_TONE.ATTENDANCE.block },
  { label: "외출(자동)", swatch: AUTO_BLOCK_TONE.OUTING.block },
  { label: "학교 시험", swatch: "bg-bg-critical-weak ring-stroke-critical-weak" },
  { label: "학교 행사", swatch: "bg-palette-purple-100 ring-palette-purple-200" },
] as const;

/** 요일 글자색 — 토요일 파랑, 일요일 빨강 (나머지는 기본) */
export function weekdayTextClass(dow: number): string {
  if (dow === 0) return "text-fg-critical";
  if (dow === 6) return "text-fg-informative";
  return "text-fg-neutral-muted";
}
