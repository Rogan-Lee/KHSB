import { useLocalSearchParams } from 'expo-router';

import { PortalWebView } from '@/components/portal-web-view';

/**
 * 학생 포털 웹뷰 화면.
 * 사용: router.push({ pathname: '/(student)/portal', params: { path: '/schedule', title: '내 일정' } })
 */
export default function StudentPortalScreen() {
  const { path, title } = useLocalSearchParams<{ path?: string; title?: string }>();

  return <PortalWebView path={path ?? ''} title={title ?? '학생 포털'} />;
}
