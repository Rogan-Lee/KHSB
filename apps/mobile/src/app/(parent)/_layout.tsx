import { Redirect, Tabs } from 'expo-router';
import { CalendarCheck, FileText, Home } from 'lucide-react-native';

import { RoleTabs, tabIcon } from '@/components/role-tabs';
import { useSession } from '@/lib/session';

export default function ParentLayout() {
  const { session, status } = useSession();

  if (status !== 'loading' && session?.role !== 'parent') {
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
        options={{ tabBarIcon: tabIcon(CalendarCheck), tabBarLabel: '출결', title: '출결' }}
      />
      <Tabs.Screen
        name="reports"
        options={{ tabBarIcon: tabIcon(FileText), tabBarLabel: '리포트', title: '리포트' }}
      />
    </RoleTabs>
  );
}
