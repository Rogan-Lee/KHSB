import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  ListTodo,
  MapPin,
  Megaphone,
  MessageCircle,
  MessageCircleHeart,
  MessageSquare,
  NotebookText,
  Podcast,
  Receipt,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  ShieldBan,
  Smartphone,
  Star,
  TrendingUp,
  UserCog,
  UserPlus,
  UserRound,
  Users,
  Utensils,
  Video,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { FeatureKey } from "@/lib/features";
import {
  canViewMentoringTime,
  isFullAccess,
  isManagerMentor,
  isOnlineStaff,
  isStaff,
} from "@/lib/roles";

// 대시보드 내비게이션 정보 구조 — 사이드바·상단 바(위치·탭 줄)·명령 팔레트가 함께 쓴다.
// 각 메뉴·탭의 show 는 그 페이지가 실제로 거는 권한 검사와 같게 둔다.

type RoleCheck = (role?: string | null) => boolean;

export type NavTab = {
  href: string;
  label: string;
  feature?: FeatureKey;
  show?: RoleCheck;
};

export type NavItem = {
  /** 메뉴 식별자이자 대표 화면. 탭이 있으면 첫 탭과 같다 */
  href: string;
  label: string;
  icon: LucideIcon;
  feature?: FeatureKey;
  /** 역할별 노출. 미지정 시 그룹이 보이는 모든 역할에 노출 */
  show?: RoleCheck;
  /** 한 메뉴로 묶은 여러 화면. 지금 화면이 이 중 하나면 상단 바에 탭 줄을 그린다 */
  tabs?: NavTab[];
};

export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  show?: RoleCheck;
};

/** 일일 보고 — 관리 멘토 + 원장급 (페이지 가드와 같음) */
const canDailyLog: RoleCheck = (role) => isManagerMentor(role) || isFullAccess(role);

/** 그룹 없이 맨 위에 두는 매일 쓰는 화면 */
export const PRIMARY_NAV: NavItem[] = [
  {
    href: "/",
    label: "홈",
    icon: LayoutDashboard,
    // 온라인 전용 역할의 홈은 /online (requireDashboardSession 이 / 를 /online 으로 보낸다).
    // 역할마다 한 탭만 보이므로 탭 줄은 그려지지 않는다
    tabs: [
      { href: "/", label: "홈", show: isStaff },
      { href: "/online", label: "온라인 대시보드", show: (role) => !isStaff(role) },
    ],
  },
  // 입퇴실·좌석은 자습실 학생만 다룬다 — 페이지 가드는 없지만 온라인 전용 역할에겐 숨긴다
  { href: "/attendance", label: "입퇴실 관리", icon: ClipboardList, feature: "attendance", show: isStaff },
  { href: "/phone-check", label: "휴대폰 검사", icon: Smartphone, show: isStaff },
  { href: "/handover", label: "인수인계", icon: ArrowLeftRight, feature: "handover" },
  { href: "/todos", label: "투두리스트", icon: ListTodo, feature: "todos" },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "students",
    label: "원생",
    icon: Users,
    items: [
      // 자습실 | 온라인 유형 탭은 화면 안에 있다 (온라인 전용 역할은 온라인만)
      { href: "/students", label: "원생 관리", icon: Users, feature: "students" },
      { href: "/waitlist", label: "대기자 관리", icon: UserPlus, show: isStaff },
      { href: "/seat-map", label: "좌석 배치도", icon: MapPin, feature: "seat-map", show: isStaff },
      { href: "/merit-demerit", label: "상벌점", icon: Star, feature: "merit-demerit", show: isStaff },
      // 등원 스케줄(시간표 제안→학부모 승인 검토) — 자습실 운영진 전체
      { href: "/online/schedules", label: "등원 스케줄", icon: CalendarClock, show: isStaff },
    ],
  },
  {
    id: "comms",
    label: "소통",
    icon: MessageCircle,
    items: [
      {
        href: "/online/inbox",
        label: "소통함",
        icon: Inbox,
        tabs: [
          { href: "/online/inbox", label: "학생 메시지" },
          { href: "/questions", label: "학생 질문", show: isStaff },
          { href: "/suggestions", label: "건의사항", show: isStaff },
          // 학부모 요청 → 학생 지시 (온라인 직원 포함 전체, 가족 톡방과 같은 기준)
          { href: "/instructions", label: "학생 지시" },
          // 쪽잠·네트워크 사용 신청 승인함
          { href: "/approvals", label: "신청함", show: isStaff },
          { href: "/staff-messages", label: "직원 메시지" },
        ],
      },
      { href: "/family-chat", label: "가족 톡방", icon: MessageCircleHeart },
      { href: "/messages", label: "카카오 발송", icon: MessageCircle, feature: "kakao-messages" },
    ],
  },
  {
    id: "learning",
    label: "학습 관리",
    icon: GraduationCap,
    items: [
      {
        href: "/mentoring",
        label: "멘토링",
        icon: MessageSquare,
        tabs: [
          { href: "/mentoring", label: "기록", feature: "mentoring", show: isStaff },
          { href: "/mentoring/schedule", label: "멘토 스케줄", feature: "mentoring" },
          // 원장/SUPER_ADMIN + 총괄 멘토만
          { href: "/mentoring/time", label: "시간 관리", feature: "mentoring", show: canViewMentoringTime },
        ],
      },
      { href: "/online/sessions", label: "화상 세션", icon: Video, show: isOnlineStaff },
      {
        href: "/mentoring-plan",
        label: "주간 계획",
        icon: CalendarClock,
        tabs: [
          { href: "/mentoring-plan", label: "주간 멘토링 계획", feature: "mentoring-plan" },
          { href: "/timetable", label: "시간표", feature: "timetable" },
        ],
      },
      { href: "/consultations", label: "면담 관리", icon: FileText, feature: "consultations" },
      {
        href: "/assignments",
        label: "과제",
        icon: ClipboardCheck,
        tabs: [
          { href: "/assignments", label: "과제", feature: "assignments" },
          { href: "/online/performance", label: "수행평가" },
        ],
      },
      {
        href: "/exams",
        label: "시험",
        icon: GraduationCap,
        tabs: [
          { href: "/exams", label: "시험 관리", feature: "exam-scores" },
          { href: "/vocab-test", label: "영단어 시험", feature: "vocab-test", show: isStaff },
        ],
      },
    ],
  },
  {
    id: "reports",
    label: "리포트",
    icon: BarChart3,
    items: [
      {
        href: "/reports/monthly",
        label: "학부모 리포트",
        icon: BarChart3,
        tabs: [
          { href: "/reports/monthly", label: "월간 리포트", feature: "reports", show: isStaff },
          { href: "/online/reports", label: "온라인 보고서", show: isFullAccess },
          { href: "/online/daily-log", label: "일일 보고", show: canDailyLog },
        ],
      },
      { href: "/analytics", label: "성과 분석", icon: TrendingUp, feature: "analytics", show: isStaff },
    ],
  },
  {
    id: "ops",
    label: "운영",
    icon: Building2,
    items: [
      { href: "/patrol", label: "순찰 관리", icon: ScanLine, show: isStaff },
      // 시설 와이파이 앱·사이트 차단 — 자습실 운영진 전체 (규칙 변경은 화면 안에서 원장급만)
      { href: "/access-control", label: "사용 통제", icon: ShieldBan, show: isStaff },
      { href: "/lunch", label: "점심 도시락", icon: Utensils, show: isStaff },
      // 수강료 청구·수납 — 조회·현장 결제 확인은 직원 전체, 발행·환불·금액 합계는 원장급만 (화면 안에서 구분)
      { href: "/tuition", label: "수강료", icon: Receipt, show: isStaff },
      { href: "/calendar", label: "캘린더", icon: CalendarDays, feature: "calendar" },
      { href: "/meeting-minutes", label: "회의록", icon: NotebookText, feature: "meeting-minutes" },
      { href: "/contents", label: "콘텐츠", icon: Podcast, show: isStaff },
    ],
  },
  {
    // 원장/SA 전용 — 직원·급여·시스템 관리
    id: "admin",
    label: "관리자",
    icon: UserCog,
    show: isFullAccess,
    items: [
      {
        href: "/mentors",
        label: "직원",
        icon: UserCog,
        tabs: [
          { href: "/mentors", label: "직원 관리", feature: "mentors" },
          { href: "/admin/auth", label: "계정 초대" },
        ],
      },
      { href: "/payroll", label: "급여 정산", icon: Wallet, feature: "payroll" },
      // 앱 신고·차단 — 접수 후 24시간 안에 원장이 확인·처리
      { href: "/moderation", label: "신고 관리", icon: ShieldAlert },
      // 동의 현황·직원 접속·외부 AI 전송·보유 기간
      { href: "/privacy", label: "개인정보 기록", icon: ShieldCheck },
      { href: "/admin/school-stats", label: "학교별 통계", icon: Building2, feature: "school-stats" },
    ],
  },
];

/** 사이드바 하단 프로필 메뉴에 두는 개인 화면 (전 직원) */
export const ACCOUNT_GROUP: NavGroup = {
  id: "account",
  label: "내 계정",
  icon: UserRound,
  items: [
    { href: "/payroll/me", label: "내 출퇴근", icon: Wallet, feature: "payroll" },
    { href: "/requests", label: "요청사항", icon: Megaphone, feature: "requests" },
  ],
};

const can = (x: { show?: RoleCheck }, role?: string | null) => (x.show ? x.show(role) : true);

/** 역할에 맞게 탭을 거른 메뉴. 보이는 탭이 없으면 null */
function itemForRole(item: NavItem, role?: string | null): NavItem | null {
  if (!can(item, role)) return null;
  if (!item.tabs) return item;
  const tabs = item.tabs.filter((t) => can(t, role));
  return tabs.length ? { ...item, tabs } : null;
}

function itemsForRole(items: NavItem[], role?: string | null): NavItem[] {
  return items.map((it) => itemForRole(it, role)).filter((it): it is NavItem => it !== null);
}

/** 메뉴를 눌렀을 때 가는 곳 — 역할에 보이는 첫 탭 (sidebarNav 결과에 쓴다) */
export function navTarget(item: NavItem): string {
  return item.tabs?.[0]?.href ?? item.href;
}

/** 사이드바용 — 역할에 맞게 거른 메뉴 (빈 그룹 제외) */
export function sidebarNav(role?: string | null): { primary: NavItem[]; groups: NavGroup[] } {
  return {
    primary: itemsForRole(PRIMARY_NAV, role),
    groups: NAV_GROUPS.filter((g) => can(g, role))
      .map((g) => ({ ...g, items: itemsForRole(g.items, role) }))
      .filter((g) => g.items.length > 0),
  };
}

/** 탭 메뉴를 화면 단위로 펼친다 — 명령 팔레트가 탭 화면도 바로 찾도록 */
function expand(item: NavItem): NavItem[] {
  if (!item.tabs) return [item];
  return item.tabs.map((t) => ({
    href: t.href,
    label: t.label === item.label ? item.label : `${item.label} · ${t.label}`,
    icon: item.icon,
    feature: t.feature ?? item.feature,
  }));
}

/** 명령 팔레트용 — 역할이 열 수 있는 화면(탭 포함) */
export function visiblePrimary(role?: string | null): NavItem[] {
  return sidebarNav(role).primary.flatMap(expand);
}

/** 명령 팔레트용 — 그룹별 화면(탭 포함) + 내 계정 */
export function visibleGroups(role?: string | null): NavGroup[] {
  return [...sidebarNav(role).groups, ACCOUNT_GROUP].map((g) => ({ ...g, items: g.items.flatMap(expand) }));
}

/** 경로 매칭 단위 — 탭이 있는 메뉴는 탭마다 하나 */
type Screen = { href: string; item: NavItem; tab?: NavTab; group?: NavGroup };

const SCREENS: Screen[] = [
  ...PRIMARY_NAV.map((item) => ({ item })),
  ...[...NAV_GROUPS, ACCOUNT_GROUP].flatMap((group) => group.items.map((item) => ({ item, group }))),
].flatMap(({ item, group }: { item: NavItem; group?: NavGroup }) =>
  item.tabs ? item.tabs.map((tab) => ({ href: tab.href, item, tab, group })) : [{ href: item.href, item, group }],
);

/**
 * 사이드바엔 없지만 상단 위치 표시가 필요한 화면.
 * parent 가 있으면 그 화면의 메뉴를 사이드바에서 현재 위치로 표시한다.
 */
const HIDDEN_ROUTES: { href: string; label: string; group?: string; parent?: string }[] = [
  { href: "/reports/ai-queue", label: "AI 예약 대기열", parent: "/reports/monthly" },
  { href: "/reports", label: "리포트", group: "reports" },
  { href: "/academic-plans", label: "학업 플래닝", group: "learning" },
  { href: "/card-news", label: "카드뉴스", group: "ops" },
  // 온라인 학생 상세 — 목록은 원생 관리의 온라인 탭
  { href: "/online/students", label: "원생 관리", parent: "/students" },
];

function hits(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function longestMatch<T extends { href: string }>(pathname: string, list: T[]): T | undefined {
  let best: T | undefined;
  for (const it of list) if (hits(pathname, it.href) && (!best || it.href.length > best.href.length)) best = it;
  return best;
}

export type NavLocation = {
  group?: NavGroup;
  /** 사이드바에서 현재 위치로 표시할 메뉴 */
  item?: NavItem;
  /** 지금 화면이 메뉴의 탭이면 그 탭 (숨은 하위 화면이면 없음) */
  tab?: NavTab;
  /** 상단 바에 보일 화면 이름 */
  label?: string;
};

/**
 * 현재 경로의 위치. 더 긴 href 가 일치하면 그쪽이 이긴다
 * (/mentoring/time 에서 /mentoring 이 아니라 시간 관리 탭이 잡히게).
 */
export function locateNav(pathname: string): NavLocation {
  const screen = longestMatch(pathname, SCREENS);
  const hidden = longestMatch(pathname, HIDDEN_ROUTES);
  if (hidden && (!screen || hidden.href.length > screen.href.length)) {
    const parent = hidden.parent ? SCREENS.find((s) => s.href === hidden.parent) : undefined;
    return {
      group: parent?.group ?? NAV_GROUPS.find((g) => g.id === hidden.group),
      item: parent?.item,
      label: hidden.label,
    };
  }
  if (!screen) return {};
  return { group: screen.group, item: screen.item, tab: screen.tab, label: screen.tab?.label ?? screen.item.label };
}

/** 사이드바에서 켤 메뉴의 href (메뉴 식별자) */
export function matchNavHref(pathname: string): string | null {
  return locateNav(pathname).item?.href ?? null;
}

/** 상단 탭 줄 — 지금 화면이 탭이고 역할에 보이는 탭이 둘 이상일 때만 */
export function navTabs(loc: NavLocation, role?: string | null): NavTab[] | null {
  if (!loc.tab || !loc.item?.tabs) return null;
  const tabs = loc.item.tabs.filter((t) => can(t, role));
  return tabs.length > 1 && tabs.includes(loc.tab) ? tabs : null;
}
