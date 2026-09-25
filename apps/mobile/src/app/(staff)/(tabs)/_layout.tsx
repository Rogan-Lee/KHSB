import { Tabs } from 'expo-router';

import { InTabsContext, SeedTabBar, type TabItem } from '@/design';
import { useStaffBadges } from '@/lib/badges';
import { isStaffCapabilities } from '@/lib/capabilities';
import { useSession } from '@/lib/session';

/**
 * 직원 탭 — 홈 · 입퇴실 · 멘토링 · 소통(질문·채팅·DM) · 전체.
 * 온라인 관리 역할(오프라인 운영 권한 없음)에게는 입퇴실·멘토링 탭을 숨긴다 (서버가 403).
 */
export default function StaffTabsLayout() {
  const badges = useStaffBadges();
  const { session } = useSession();
  const caps = isStaffCapabilities(session?.capabilities) ? session.capabilities : null;
  const offline = caps?.offlineOps ?? true;

  const items: Record<string, TabItem> = {
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
  return (
    <InTabsContext.Provider value>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <SeedTabBar {...props} items={items} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="attendance" />
        <Tabs.Screen name="mentoring" />
        <Tabs.Screen name="inbox" />
        <Tabs.Screen name="menu" />
      </Tabs>
    </InTabsContext.Provider>
  );
}
