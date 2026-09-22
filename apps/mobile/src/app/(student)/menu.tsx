import { router } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import {
  CalendarDays,
  ClipboardList,
  Film,
  Gift,
  Moon,
  UtensilsCrossed,
  Wifi,
} from 'lucide-react-native';

import { AppScreen } from '@/components/app-screen';
import { HubGrid, HubTile, SectionTitle } from '@/components/mobile-ui';
import type { Tone } from '@/constants/theme';

type MenuItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  tone: Tone;
};

const MENU_ITEMS: MenuItem[] = [
  { icon: Gift, label: '포인트 상점', path: '/points', tone: 'violet' },
  { icon: Moon, label: '쪽잠 신청', path: '/nap', tone: 'info' },
  { icon: Wifi, label: '와이파이·앱 사용', path: '/network', tone: 'blue' },
  { icon: Film, label: '콘텐츠', path: '/contents', tone: 'negative' },
  { icon: CalendarDays, label: '내 일정', path: '/schedule', tone: 'positive' },
  { icon: UtensilsCrossed, label: '도시락', path: '/lunch', tone: 'warning' },
  { icon: ClipboardList, label: '모의고사 신청', path: '/exam', tone: 'primary' },
];

/** 학생 포털 신규 기능 진입점 — 각 항목은 portal 웹뷰 화면으로 이동한다. */
export default function StudentMenuScreen() {
  return (
    <AppScreen subtitle="포털 기능 바로가기" title="전체 메뉴">
      <SectionTitle>학생 포털</SectionTitle>
      <HubGrid>
        {MENU_ITEMS.map((item) => (
          <HubTile
            icon={item.icon}
            key={item.path}
            label={item.label}
            onPress={() =>
              router.push({
                pathname: '/(student)/portal',
                params: { path: item.path, title: item.label },
              })
            }
            tone={item.tone}
          />
        ))}
      </HubGrid>
    </AppScreen>
  );
}
