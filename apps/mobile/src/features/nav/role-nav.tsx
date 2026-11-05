import type { Href } from 'expo-router';
import {
  CalendarClock,
  CalendarDays,
  Coins,
  GraduationCap,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Podcast,
  Receipt,
  SpellCheck,
  Utensils,
} from 'lucide-react-native';
import { createContext, useContext, type ReactNode } from 'react';

import { TabletShell, type SideNavItem, type SideNavProfile, type TabItem } from '@/design';
import { canOpen, ROLE_LABEL, STAFF_DEST, type StaffDest } from '@/features/staff-home/links';
import { useParentBadges, useStaffBadges, useStudentBadges } from '@/lib/badges';
import { isStaffCapabilities } from '@/lib/capabilities';
import { useSession } from '@/lib/session';

// 역할별 내비게이션 — 폰 하단 탭바와 태블릿 사이드바가 같은 정의를 쓴다.
// 배지 훅은 역할 레이아웃에서 한 번만 돌리고((tabs) 레이아웃은 컨텍스트로 받음) 요청이 겹치지 않게 한다.

type Group = 'staff' | 'student' | 'parent';
type RoleNav = { tabs: Record<string, TabItem> };

const RoleNavContext = createContext<RoleNav>({ tabs: {} });

/** (tabs) 레이아웃의 하단 탭 항목 */
export function useRoleTabs() {
  return useContext(RoleNavContext).tabs;
}

function RoleShell({
  group,
  tabs,
  shortcuts,
  profile,
  children,
}: {
  group: Group;
  tabs: Record<string, TabItem>;
  shortcuts: SideNavItem[];
  profile?: SideNavProfile;
  children: ReactNode;
}) {
  const side: SideNavItem[] = Object.entries(tabs).map(([name, t]) => ({
    key: name,
    label: t.label,
    tabIcon: t.icon,
    badge: t.badge,
    href: `/(${group})/(tabs)${name === 'index' ? '' : `/${name}`}` as Href,
  }));
  return (
    <RoleNavContext.Provider value={{ tabs }}>
      <TabletShell tabs={side} shortcuts={shortcuts} profile={profile}>
        {children}
      </TabletShell>
    </RoleNavContext.Provider>
  );
}

const STAFF_SHORTCUTS: StaffDest[] = [
  'students',
  'seatMap',
  'phoneCheck',
  'patrol',
  'handover',
  'approvals',
  'tasks',
  'calendar',
];

/**
 * 직원 탭 — 홈 · 입퇴실 · 멘토링 · 소통(질문·채팅·DM) · 전체.
 * 온라인 관리 역할(오프라인 운영 권한 없음)에게는 입퇴실·멘토링 탭을 숨긴다 (서버가 403).
 */
export function StaffShell({ children }: { children: ReactNode }) {
  const badges = useStaffBadges();
  const { session } = useSession();
  const caps = isStaffCapabilities(session?.capabilities) ? session.capabilities : null;
  const offline = caps?.offlineOps ?? true;

  const tabs: Record<string, TabItem> = {
    index: { label: '홈', icon: 'home', badge: badges.home > 0 ? 'dot' : 0 },
    ...(offline
      ? {
          attendance: { label: '입퇴실', icon: 'calendar' } as TabItem,
          mentoring: { label: '멘토링', icon: 'people', badge: badges.mentoring } as TabItem,
        }
      : {}),
    inbox: { label: '소통', icon: 'chat', badge: badges.inbox },
    menu: { label: '전체', icon: 'menu', badge: badges.menu > 0 ? 'dot' : 0 },
  };
  const shortcuts: SideNavItem[] = STAFF_SHORTCUTS.filter((k) => canOpen(caps, k)).map((k) => ({
    key: k,
    label: STAFF_DEST[k].label,
    icon: STAFF_DEST[k].icon,
    href: STAFF_DEST[k].href,
    badge: k === 'approvals' ? badges.approvals : 0,
  }));
  const profile = session
    ? { name: session.displayName, caption: ROLE_LABEL[session.staffRole ?? ''] ?? '직원' }
    : undefined;

  return (
    <RoleShell group="staff" tabs={tabs} shortcuts={shortcuts} profile={profile}>
      {children}
    </RoleShell>
  );
}

/** 학생 탭 — 웹 학생 포털(/s/[token])과 같은 5탭: 홈 · 수행평가 · 질문 · 메시지 · 전체 */
export function StudentShell({ children }: { children: ReactNode }) {
  const badges = useStudentBadges();
  const { session } = useSession();

  const tabs: Record<string, TabItem> = {
    index: { label: '홈', icon: 'home' },
    tasks: { label: '수행평가', icon: 'tasks', badge: badges.tasks },
    qna: { label: '질문', icon: 'qna', badge: badges.qna },
    chat: { label: '메시지', icon: 'chat', badge: badges.chat },
    menu: { label: '전체', icon: 'menu', badge: badges.menu > 0 ? 'dot' : 0 },
  };
  const shortcuts: SideNavItem[] = [
    { key: 'feedback', label: '받은 피드백', icon: MessageCircle, href: '/(student)/feedback' as Href, badge: badges.feedback },
    ...(badges.hasVocab
      ? [{ key: 'vocab', label: '영단어 시험', icon: SpellCheck, href: '/(student)/vocab' as Href, badge: badges.vocab }]
      : []),
    { key: 'schedule', label: '내 일정', icon: CalendarDays, href: '/(student)/schedule' as Href },
    { key: 'lunch', label: '점심 도시락', icon: Utensils, href: '/(student)/lunch' as Href },
    { key: 'points', label: '상벌점', icon: Coins, href: '/(student)/points' as Href },
    { key: 'exams', label: '모의고사', icon: GraduationCap, href: '/(student)/exams' as Href },
    { key: 'contents', label: '콘텐츠', icon: Podcast, href: '/(student)/contents' as Href },
  ];
  const profile = session ? { name: session.displayName, caption: '학생' } : undefined;

  return (
    <RoleShell group="student" tabs={tabs} shortcuts={shortcuts} profile={profile}>
      {children}
    </RoleShell>
  );
}

/** 학부모 탭 — 홈(오늘) · 출결 · 리포트 · 성장 · 전체 */
export function ParentShell({ children }: { children: ReactNode }) {
  const badges = useParentBadges();
  const { session } = useSession();

  const tabs: Record<string, TabItem> = {
    index: { label: '홈', icon: 'home' },
    attendance: { label: '출결', icon: 'calendar' },
    reports: { label: '리포트', icon: 'report', badge: badges.reports },
    growth: { label: '성장', icon: 'growth' },
    // 승인 대기 스케줄 + 결제할 수강료
    menu: { label: '전체', icon: 'menu', badge: badges.menu + (badges.tuition ?? 0) > 0 ? 'dot' : 0 },
  };
  const shortcuts: SideNavItem[] = [
    { key: 'tuition', label: '수강료', icon: Receipt, href: '/(parent)/tuition' as Href, badge: badges.tuition ?? 0 },
    { key: 'lunch', label: '점심 도시락', icon: Utensils, href: '/(parent)/lunch' as Href },
    { key: 'schedule', label: '등원 스케줄', icon: CalendarClock, href: '/(parent)/schedule' as Href },
    { key: 'exams', label: '모의고사 신청', icon: GraduationCap, href: '/(parent)/exams' as Href },
    { key: 'inquiries', label: '원장님께 문의', icon: MessageSquareText, href: '/(parent)/inquiries' as Href },
    { key: 'notices', label: '공지사항', icon: Megaphone, href: '/(parent)/notices' as Href },
  ];
  const profile = session ? { name: session.displayName, caption: '학부모' } : undefined;

  return (
    <RoleShell group="parent" tabs={tabs} shortcuts={shortcuts} profile={profile}>
      {children}
    </RoleShell>
  );
}
