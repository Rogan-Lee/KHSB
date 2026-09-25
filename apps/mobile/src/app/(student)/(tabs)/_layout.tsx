import { Tabs } from 'expo-router';

import { InTabsContext, SeedTabBar, type TabItem } from '@/design';
import { useStudentBadges } from '@/lib/badges';

/** 학생 탭 — 웹 학생 포털(/s/[token])과 같은 5탭: 홈 · 수행평가 · 질문 · 메시지 · 전체 */
export default function StudentTabsLayout() {
  const badges = useStudentBadges();
  const items: Record<string, TabItem> = {
    index: { label: '홈', icon: 'home' },
    tasks: { label: '수행평가', icon: 'tasks', badge: badges.tasks },
    qna: { label: '질문', icon: 'qna', badge: badges.qna },
    chat: { label: '메시지', icon: 'chat', badge: badges.chat },
    menu: { label: '전체', icon: 'menu', badge: badges.menu > 0 ? 'dot' : 0 },
  };
  return (
    <InTabsContext.Provider value>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <SeedTabBar {...props} items={items} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="tasks" />
        <Tabs.Screen name="qna" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="menu" />
      </Tabs>
    </InTabsContext.Provider>
  );
}
