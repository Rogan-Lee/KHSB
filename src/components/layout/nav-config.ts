import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Building2,
  Calendar,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Globe,
  GraduationCap,
  HelpCircle,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LayoutList,
  ListTodo,
  MapPin,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MessageSquarePlus,
  MessagesSquare,
  NotebookText,
  Podcast,
  ScanLine,
  Smartphone,
  Star,
  TrendingUp,
  UserCog,
  UserPlus,
  Users,
  Utensils,
  Video,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { FeatureKey } from "@/lib/features";
import { canViewMentoringTime, isFullAccess, isOnlineStaff, isStaff } from "@/lib/roles";

// 대시보드 내비게이션 정보 구조 — 사이드바·헤더 제목·명령 팔레트가 함께 쓴다.

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  feature?: FeatureKey;
  /** 역할별 노출. 미지정 시 그룹이 보이는 모든 역할에 노출 */
  show?: (role?: string | null) => boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  show?: (role?: string | null) => boolean;
};

/** 그룹 없이 맨 위에 두는 매일 쓰는 화면 */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "홈", icon: LayoutDashboard },
  { href: "/attendance", label: "입퇴실 관리", icon: ClipboardList, feature: "attendance" },
  { href: "/phone-check", label: "휴대폰 검사", icon: Smartphone },
  { href: "/handover", label: "인수인계", icon: ArrowLeftRight, feature: "handover" },
  { href: "/todos", label: "투두리스트", icon: ListTodo, feature: "todos" },
  // 직원 1:1 메시지 — 미확인 배지가 늘 보이도록 맨 위 목록에 둔다
  { href: "/staff-messages", label: "직원 메시지", icon: MessagesSquare },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "students",
    label: "원생",
    icon: Users,
    items: [
      { href: "/students", label: "원생 관리", icon: Users, feature: "students" },
      { href: "/waitlist", label: "대기자 관리", icon: UserPlus },
      { href: "/seat-map", label: "좌석 배치도", icon: MapPin, feature: "seat-map" },
      { href: "/merit-demerit", label: "상벌점", icon: Star, feature: "merit-demerit", show: isStaff },
      { href: "/vocab-test", label: "영단어 시험", icon: BookOpen, feature: "vocab-test" },
      // 등원 스케줄(시간표 제안→학부모 승인 검토) — 자습실 운영진 전체
      { href: "/online/schedules", label: "등원 스케줄", icon: CalendarClock, show: isStaff },
    ],
  },
  {
    id: "learning",
    label: "과제·시험",
    icon: GraduationCap,
    items: [
      { href: "/assignments", label: "과제 관리", icon: ClipboardCheck, feature: "assignments" },
      { href: "/online/performance", label: "수행평가", icon: ClipboardCheck },
      { href: "/exams", label: "시험 관리", icon: GraduationCap, feature: "exam-scores" },
    ],
  },
  {
    id: "voice",
    label: "학생 소통",
    icon: MessageCircle,
    items: [
      { href: "/questions", label: "학생 질문", icon: HelpCircle },
      { href: "/suggestions", label: "학생 건의사항", icon: MessageSquarePlus },
      // 쪽잠·네트워크 사용 신청 승인함
      { href: "/approvals", label: "신청함", icon: Inbox },
      { href: "/online/inbox", label: "학생 메시지", icon: MessageSquare },
    ],
  },
  {
    id: "mentoring",
    label: "멘토링",
    icon: MessageSquare,
    items: [
      { href: "/mentoring", label: "멘토링", icon: MessageSquare, feature: "mentoring", show: isStaff },
      { href: "/mentoring-plan", label: "주간 멘토링 계획", icon: CalendarClock, feature: "mentoring-plan" },
      { href: "/timetable", label: "시간표", icon: LayoutList, feature: "timetable" },
      { href: "/consultations", label: "면담 관리", icon: FileText, feature: "consultations" },
      { href: "/mentoring/schedule", label: "멘토 스케줄", icon: Calendar, feature: "mentoring" },
      // 원장/SUPER_ADMIN + 총괄 멘토만
      { href: "/mentoring/time", label: "멘토링 시간 관리", icon: Clock, feature: "mentoring", show: canViewMentoringTime },
    ],
  },
  {
    id: "ops",
    label: "운영",
    icon: Building2,
    items: [
      { href: "/patrol", label: "순찰 관리", icon: ScanLine },
      { href: "/lunch", label: "점심 도시락", icon: Utensils },
      { href: "/calendar", label: "캘린더", icon: CalendarDays, feature: "calendar" },
      { href: "/meeting-minutes", label: "회의록", icon: NotebookText, feature: "meeting-minutes" },
      { href: "/messages", label: "카카오 메시지", icon: MessageCircle, feature: "kakao-messages" },
      { href: "/contents", label: "콘텐츠", icon: Podcast, show: isStaff },
      { href: "/requests", label: "요청사항", icon: Megaphone, feature: "requests" },
    ],
  },
  {
    id: "insights",
    label: "리포트·분석",
    icon: BarChart3,
    show: isStaff,
    items: [
      { href: "/reports/monthly", label: "월간 리포트", icon: BarChart3, feature: "reports" },
      { href: "/analytics", label: "성과 분석", icon: TrendingUp, feature: "analytics" },
    ],
  },
  {
    // 원장·SUPER_ADMIN·컨설턴트·관리 멘토 전용
    id: "online",
    label: "온라인 관리",
    icon: Globe,
    show: isOnlineStaff,
    items: [
      { href: "/online", label: "온라인 대시보드", icon: Globe },
      { href: "/online/students", label: "온라인 학생", icon: Users },
      { href: "/online/sessions", label: "화상 1:1 세션", icon: Video },
      { href: "/online/daily-log", label: "일일 보고", icon: MessageSquare },
      { href: "/online/reports", label: "학부모 보고서", icon: FileText },
    ],
  },
  {
    // 원장/SA 전용 — 급여·시스템 관리
    id: "admin",
    label: "관리자",
    icon: UserCog,
    show: isFullAccess,
    items: [
      { href: "/mentors", label: "직원 관리", icon: UserCog, feature: "mentors" },
      { href: "/admin/auth", label: "계정 초대", icon: KeyRound },
      { href: "/payroll", label: "급여 정산", icon: Wallet, feature: "payroll" },
      { href: "/payroll/me", label: "내 출퇴근", icon: Wallet, feature: "payroll" },
      { href: "/admin/school-stats", label: "학교별 통계", icon: Building2, feature: "school-stats" },
    ],
  },
];

/** 역할에 맞게 거른 그룹 목록 (빈 그룹 제외) */
export function visibleGroups(role?: string | null): NavGroup[] {
  return NAV_GROUPS.filter((g) => (g.show ? g.show(role) : true))
    .map((g) => ({ ...g, items: g.items.filter((it) => (it.show ? it.show(role) : true)) }))
    .filter((g) => g.items.length > 0);
}

export function visiblePrimary(role?: string | null): NavItem[] {
  return PRIMARY_NAV.filter((it) => (it.show ? it.show(role) : true));
}

const ALL_ITEMS: NavItem[] = [...PRIMARY_NAV, ...NAV_GROUPS.flatMap((g) => g.items)];

/**
 * 사이드바엔 없지만 상단 위치 표시가 필요한 화면.
 * parent 가 있으면 사이드바에서 그 메뉴를 현재 위치로 표시한다.
 */
const HIDDEN_ROUTES: { href: string; label: string; group?: string; parent?: string }[] = [
  { href: "/reports/ai-queue", label: "AI 예약 대기열", group: "insights", parent: "/reports/monthly" },
  { href: "/reports", label: "리포트", group: "insights" },
  { href: "/academic-plans", label: "학업 플래닝", group: "mentoring" },
  { href: "/card-news", label: "카드뉴스", group: "ops" },
];

function hits(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function longestMatch<T extends { href: string }>(pathname: string, list: T[]): T | undefined {
  let best: T | undefined;
  for (const it of list) if (hits(pathname, it.href) && (!best || it.href.length > best.href.length)) best = it;
  return best;
}

/**
 * 현재 경로에 가장 잘 맞는 메뉴 href.
 * 더 긴 href 가 일치하면 그쪽이 이긴다 (/mentoring/time 에서 /mentoring 이 켜지지 않게).
 */
export function matchNavHref(pathname: string): string | null {
  const item = longestMatch(pathname, ALL_ITEMS);
  const hidden = longestMatch(pathname, HIDDEN_ROUTES);
  if (hidden && (!item || hidden.href.length > item.href.length)) return hidden.parent ?? null;
  return item?.href ?? null;
}

/** 헤더 경로 표시용 — { group: "원생", item: "원생 관리" } */
export function locateNav(pathname: string): { group?: NavGroup; item?: Pick<NavItem, "href" | "label"> } {
  const item = longestMatch(pathname, ALL_ITEMS);
  const hidden = longestMatch(pathname, HIDDEN_ROUTES);
  if (hidden && (!item || hidden.href.length > item.href.length)) {
    return { group: NAV_GROUPS.find((g) => g.id === hidden.group), item: hidden };
  }
  if (!item) return {};
  const group = NAV_GROUPS.find((g) => g.items.some((it) => it.href === item.href));
  return { group, item };
}
