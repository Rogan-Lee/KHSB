import { Tabs } from 'expo-router';

import { InTabsContext, SeedTabBar, useResponsive } from '@/design';
import { useRoleTabs } from '@/features/nav/role-nav';

/** 학부모 탭 — 홈(오늘) · 출결 · 리포트 · 성장 · 전체 — 항목·배지는 역할 레이아웃(features/nav/role-nav)이 정한다. 태블릿은 하단 탭바 대신 사이드바 */
export default function TabsLayout() {
  const items = useRoleTabs();
  const { isTablet } = useResponsive();
  return (
    <InTabsContext.Provider value={!isTablet}>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => (isTablet ? null : <SeedTabBar {...props} items={items} />)}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="attendance" />
        <Tabs.Screen name="reports" />
        <Tabs.Screen name="growth" />
        <Tabs.Screen name="menu" />
      </Tabs>
    </InTabsContext.Provider>
  );
}
