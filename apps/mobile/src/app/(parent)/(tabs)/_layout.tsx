import { Tabs } from 'expo-router';

import { InTabsContext, SeedTabBar, type TabItem } from '@/design';
import { useParentBadges } from '@/lib/badges';

/** 학부모 탭 — 홈(오늘) · 출결 · 리포트 · 성장 · 전체 */
export default function ParentTabsLayout() {
  const badges = useParentBadges();
  const items: Record<string, TabItem> = {
    index: { label: '홈', icon: 'home' },
    attendance: { label: '출결', icon: 'calendar' },
    reports: { label: '리포트', icon: 'report', badge: badges.reports },
    growth: { label: '성장', icon: 'growth' },
    menu: { label: '전체', icon: 'menu', badge: badges.menu > 0 ? 'dot' : 0 },
  };
  return (
    <InTabsContext.Provider value>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <SeedTabBar {...props} items={items} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="attendance" />
        <Tabs.Screen name="reports" />
        <Tabs.Screen name="growth" />
        <Tabs.Screen name="menu" />
      </Tabs>
    </InTabsContext.Provider>
  );
}
