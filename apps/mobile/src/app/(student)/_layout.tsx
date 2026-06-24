import { Redirect, Tabs } from 'expo-router';
import { BookA, Bookmark, Home, MessagesSquare } from 'lucide-react-native';

import { RoleTabs, tabIcon } from '@/components/role-tabs';
import { useSession } from '@/lib/session';

export default function StudentLayout() {
  const { session, status } = useSession();

  if (status !== 'loading' && session?.role !== 'student') {
    return <Redirect href="/(auth)" />;
  }

  return (
    <RoleTabs>
      <Tabs.Screen
        name="index"
        options={{ tabBarIcon: tabIcon(Home), tabBarLabel: '홈', title: '홈' }}
      />
      <Tabs.Screen
        name="student-tasks"
        options={{ tabBarIcon: tabIcon(Bookmark), tabBarLabel: '과제', title: '과제·수행평가' }}
      />
      <Tabs.Screen
        name="vocab"
        options={{ tabBarIcon: tabIcon(BookA), tabBarLabel: '단어', title: '단어' }}
      />
      <Tabs.Screen
        name="chat"
        options={{ tabBarIcon: tabIcon(MessagesSquare), tabBarLabel: '소통', title: '멘토 채팅' }}
      />
      {/* 보조 라우트 — 탭바에는 노출하지 않음 */}
      <Tabs.Screen name="programs" options={{ href: null, title: '프로그램' }} />
      <Tabs.Screen name="qna" options={{ href: null, title: '질의응답' }} />
      <Tabs.Screen name="feedback" options={{ href: null, title: '받은 피드백' }} />
      <Tabs.Screen name="suggestions" options={{ href: null, title: '건의사항' }} />
      <Tabs.Screen name="more" options={{ href: null, title: '내 정보' }} />
    </RoleTabs>
  );
}
