import { Redirect, Tabs } from 'expo-router';
import { CircleHelp, Grid2X2, Home, UserRound } from 'lucide-react-native';

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
        name="programs"
        options={{ tabBarIcon: tabIcon(Grid2X2), tabBarLabel: '프로그램', title: '프로그램' }}
      />
      <Tabs.Screen
        name="qna"
        options={{ tabBarIcon: tabIcon(CircleHelp), tabBarLabel: '질의응답', title: '질의응답' }}
      />
      <Tabs.Screen
        name="more"
        options={{ tabBarIcon: tabIcon(UserRound), tabBarLabel: '내 정보', title: '내 정보' }}
      />
      <Tabs.Screen name="student-tasks" options={{ href: null, title: '수행평가' }} />
    </RoleTabs>
  );
}
