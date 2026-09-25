import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// SEED Design(@seed-design/tailwind4-theme) 유틸을 tailwind-merge 가 인식하도록 확장.
// 예: cn("py-x12", "py-x8") → "py-x8", cn("t5-regular", "t6-bold") → "t6-bold".
const SEED_DIMENSIONS = [
  "x0_5", "x1", "x1_5", "x2", "x2_5", "x3", "x3_5", "x4", "x4_5", "x5",
  "x6", "x7", "x8", "x9", "x10", "x12", "x13", "x14", "x16",
];
const SEED_RADII = ["r0_5", "r1", "r1_5", "r2", "r2_5", "r3", "r3_5", "r4", "r5", "r6"];
const SEED_TEXT_STYLES = Array.from({ length: 14 }, (_, i) => `t${i + 1}`).flatMap((t) =>
  ["", "-static"].flatMap((s) => ["regular", "medium", "bold"].map((w) => `${t}${s}-${w}`))
);

const twMerge = extendTailwindMerge<"seed-text-style">({
  extend: {
    theme: {
      spacing: SEED_DIMENSIONS,
      radius: SEED_RADII,
    },
    classGroups: {
      "seed-text-style": [...SEED_TEXT_STYLES, "screen-title", "article-body", "article-note"],
    },
    conflictingClassGroups: {
      "seed-text-style": ["font-size", "font-weight", "leading", "tracking"],
      "font-size": ["seed-text-style"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const KST = { timeZone: "Asia/Seoul" } as const;

export function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...KST,
  });
}

export function formatDateTime(date: Date | string) {
  return new Date(date).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...KST,
  });
}

export function formatTime(date: Date | string) {
  return new Date(date).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    ...KST,
  });
}

// KST 기준 오늘 날짜 자정 (UTC로 저장됨)
export function todayKST(): Date {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(kst.toISOString().slice(0, 10)); // "YYYY-MM-DD" → UTC midnight
}

// KST 기준 현재 시각 "HH:MM" 문자열
export function nowKSTTimeString(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(11, 16);
}

// "YYYY-MM-DD" + "HH:MM" → KST로 해석한 Date (UTC 저장용)
export function toKSTDateTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00+09:00`);
}

export const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export const GRADE_OPTIONS = [
  "중1", "중2", "중3",
  "예비고1",
  "고1", "고2", "고3",
  "고3(퇴원예정)",
  "N수", "기타",
];

// "반송고2" → "반송고", "반송고3" → "반송고" (끝 숫자는 학년)
export function parseSchool(school: string): string {
  return school.replace(/\d+$/, "").trim();
}

export const MERIT_CATEGORIES = [
  "학습 태도",
  "출석",
  "성적 향상",
  "봉사/협력",
  "규칙 준수",
  "기타",
];
