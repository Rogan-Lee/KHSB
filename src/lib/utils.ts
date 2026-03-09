import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDateTime(date: Date | string) {
  return new Date(date).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(date: Date | string) {
  return new Date(date).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export const GRADE_OPTIONS = [
  "중1", "중2", "중3",
  "고1", "고2", "고3",
  "N수", "기타",
];

export const MERIT_CATEGORIES = [
  "학습 태도",
  "출석",
  "성적 향상",
  "봉사/협력",
  "규칙 준수",
  "기타",
];
