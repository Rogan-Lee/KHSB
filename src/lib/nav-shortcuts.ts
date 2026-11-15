import { useSyncExternalStore } from "react";

/**
 * 숫자키(1~9) 전역 단축키. 명령 팔레트(Ctrl/⌘+K)가 키를 받고, 팔레트 목록에 숫자를 함께 보여 준다.
 * 메뉴 목록 자체는 layout/nav-config.ts 가 단일 출처. 여기 href 는 그 메뉴들의 대표 화면과 같아야 한다.
 */
export type NavShortcut = {
  label: string;
  href: string;
  digit: string;
};

export const NAV_SHORTCUTS: NavShortcut[] = [
  { label: "홈", href: "/", digit: "1" },
  { label: "입퇴실 관리", href: "/attendance", digit: "2" },
  { label: "인수인계", href: "/handover", digit: "3" },
  { label: "투두리스트", href: "/todos", digit: "4" },
  { label: "원생 관리", href: "/students", digit: "5" },
  { label: "상벌점", href: "/merit-demerit", digit: "6" },
  { label: "멘토링", href: "/mentoring", digit: "7" },
  { label: "순찰 관리", href: "/patrol", digit: "8" },
  { label: "면담 관리", href: "/consultations", digit: "9" },
];

/** 숫자키 → href 맵 (전역 단축키용) */
export const DIGIT_NAV: Record<string, string> = Object.fromEntries(
  NAV_SHORTCUTS.map((n) => [n.digit, n.href]),
);

/** 현재 플랫폼이 macOS 계열인지 (수정키 표기 분기용) */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  return /mac|iphone|ipad|ipod/i.test(ua);
}

/** Ctrl/⌘ 표기 — Windows·Linux 는 "Ctrl", macOS 는 "⌘" */
export function modKeyLabel(): string {
  return isMacPlatform() ? "⌘" : "Ctrl";
}

const emptySubscribe = () => () => {};
/**
 * 수정키 표기를 SSR-안전하게 반환하는 훅.
 * 서버 스냅샷은 "Ctrl", 클라이언트 스냅샷은 실제 플랫폼 값 → hydration 불일치/cascading render 없음.
 */
export function useModKey(): string {
  return useSyncExternalStore(
    emptySubscribe,
    () => modKeyLabel(),
    () => "Ctrl",
  );
}
