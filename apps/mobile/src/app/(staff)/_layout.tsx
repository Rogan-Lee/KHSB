import { Redirect, Tabs } from 'expo-router';
import { CircleHelp, ClockArrowDown, Home, MoreHorizontal, UsersRound } from 'lucide-react-native';

import { RoleTabs, tabIcon } from '@/components/role-tabs';
import { useSession } from '@/lib/session';

export default function StaffLayout() {
  const { session, status } = useSession();

  if (status !== 'loading' && session?.role !== 'staff') {
    return <Redirect href="/(auth)" />;
  }

  return (
    <RoleTabs>
      <Tabs.Screen
        name="index"
        options={{ tabBarIcon: tabIcon(Home), tabBarLabel: '홈', title: '홈' }}
      />
      <Tabs.Screen
        name="attendance"
        options={{ tabBarIcon: tabIcon(ClockArrowDown), tabBarLabel: '입퇴실', title: '입퇴실' }}
      />
      <Tabs.Screen
        name="mentoring"
        options={{ tabBarIcon: tabIcon(UsersRound), tabBarLabel: '멘토링', title: '멘토링' }}
      />
      <Tabs.Screen
        name="qna"
        options={{ tabBarIcon: tabIcon(CircleHelp), tabBarLabel: '질의응답', title: '질의응답' }}
      />
      <Tabs.Screen
        name="more"
        options={{ tabBarIcon: tabIcon(MoreHorizontal), tabBarLabel: '더보기', title: '더보기' }}
      />
      <Tabs.Screen name="staff-tasks" options={{ href: null, title: '수행평가 관리' }} />
    </RoleTabs>
  );
}
