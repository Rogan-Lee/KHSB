import { useSyncExternalStore } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  ArrowLeftRight,
  ListTodo,
  Users,
  Star,
  MessageSquare,
  ScanLine,
  FileText,
  CalendarClock,
  GraduationCap,
  BookOpen,
  CalendarDays,
  Images,
  type LucideIcon,
} from "lucide-react";

/**
 * 명령 팔레트(Ctrl/⌘+K)와 상단 빠른이동 바가 공유하는 큐레이션 내비 목록.
 * digit 가 있는 항목은 숫자키(1~9) 전역 단축키 + 빠른이동 바에 노출된다.
 * 전 직원 접근 가능한 자주 쓰는 페이지 위주(사이드바 전체 목록은 app-sidebar.tsx).
 */
export type NavShortcut = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** 숫자키 단축키 (1~9). 없으면 팔레트 검색으로만 접근. */
  digit?: string;
};

export const NAV_SHORTCUTS: NavShortcut[] = [
  { label: "대시보드", href: "/", icon: LayoutDashboard, digit: "1" },
  { label: "입퇴실 관리", href: "/attendance", icon: ClipboardList, digit: "2" },
  { label: "인수인계", href: "/handover", icon: ArrowLeftRight, digit: "3" },
  { label: "투두리스트", href: "/todos", icon: ListTodo, digit: "4" },
  { label: "원생 관리", href: "/students", icon: Users, digit: "5" },
  { label: "상벌점", href: "/merit-demerit", icon: Star, digit: "6" },
  { label: "멘토링", href: "/mentoring", icon: MessageSquare, digit: "7" },
  { label: "순찰 관리", href: "/patrol", icon: ScanLine, digit: "8" },
  { label: "면담 관리", href: "/consultations", icon: FileText, digit: "9" },
  // 숫자키 없음 — 팔레트 검색용 추가 페이지
  { label: "주간 멘토링 계획", href: "/mentoring-plan", icon: CalendarClock },
  { label: "시험 관리", href: "/exams", icon: GraduationCap },
  { label: "영단어 시험", href: "/vocab-test", icon: BookOpen },
  { label: "캘린더", href: "/calendar", icon: CalendarDays },
  { label: "사진 관리", href: "/photos", icon: Images },
];

/** 숫자키 → href 맵 (전역 단축키용) */
export const DIGIT_NAV: Record<string, string> = Object.fromEntries(
  NAV_SHORTCUTS.filter((n) => n.digit).map((n) => [n.digit as string, n.href]),
);

/** 상단 빠른이동 바에 노출할 항목 (숫자키 보유분) */
export const QUICK_BAR_ITEMS: NavShortcut[] = NAV_SHORTCUTS.filter((n) => n.digit);

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
