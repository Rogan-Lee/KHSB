import { usePathname, useRouter, type Href } from 'expo-router';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SidebarWidthContext, useResponsive } from '@/lib/responsive';

import { Press } from './press';
import { TabIcon, type TabIconName } from './tab-icons';
import { Text } from './text';
import { color, radius, space } from './tokens';
import { Avatar, CountBadge } from './ui';

/**
 * 태블릿 전용 셸 — 왼쪽 사이드 내비게이션 + 오른쪽 화면.
 * 역할 레이아웃((staff)/_layout 등)이 스택을 감싸므로 하위 화면으로 들어가도 사이드바가 남는다.
 * 폰에서는 children 만 그린다(하단 탭바는 (tabs) 레이아웃이 그대로 담당).
 *  · 가로(≥1000): 아이콘 + 이름 + 바로가기 목록(264)
 *  · 세로 태블릿(700~1000, 안드로이드 태블릿 세로·화면 분할): 아이콘 레일(88)
 */

export type SideNavItem = {
  key: string;
  label: string;
  href: Href;
  /** 주 메뉴(탭)는 탭바와 같은 아이콘 */
  tabIcon?: TabIconName;
  /** 바로가기는 lucide 아이콘 */
  icon?: LucideIcon;
  badge?: number | 'dot';
};

export type SideNavProfile = { name: string; caption: string };

/**
 * 스택 화면 전환 — 폰은 오른쪽에서 밀어 넣기, 태블릿은 짧은 페이드.
 * 태블릿은 사이드바가 남아 있고 사이드바 이동이 '하위 화면 닫기 + 새 화면 열기'를 한 번에 해서,
 * 밀어 넣기면 두 애니메이션이 겹쳐 어지럽다.
 */
export function useStackAnimation() {
  const { isTablet } = useResponsive();
  return isTablet
    ? ({ animation: 'fade', animationDuration: 200 } as const)
    : ({ animation: 'slide_from_right' } as const);
}

const FULL_WIDTH = 264;
const RAIL_WIDTH = 88;

export function TabletShell({
  tabs,
  shortcuts = [],
  profile,
  children,
}: {
  tabs: SideNavItem[];
  shortcuts?: SideNavItem[];
  profile?: SideNavProfile;
  children: ReactNode;
}) {
  const { isTablet, isWide } = useResponsive();
  const width = isTablet ? (isWide ? FULL_WIDTH : RAIL_WIDTH) : 0;
  // 폰↔태블릿(안드로이드 창 크기 변경)에도 children 위치가 같아야 스택 상태가 유지된다 → 항상 같은 틀
  return (
    <View style={s.shell}>
      {isTablet && <SideNav tabs={tabs} shortcuts={shortcuts} profile={profile} rail={!isWide} width={width} />}
      <SidebarWidthContext.Provider value={width}>
        <View style={s.content}>{children}</View>
      </SidebarWidthContext.Provider>
    </View>
  );
}

/** 그룹을 뺀 경로: '/(staff)/(tabs)/inbox?x=1' → '/inbox' */
function toPath(href: Href) {
  const path = String(href).split('?')[0].replace(/\/\([^)]+\)/g, '');
  return path === '' ? '/' : path;
}

/** 지금 경로에 가장 길게 맞는 항목 — 홈('/')은 정확히 같을 때만 */
function activeKey(items: SideNavItem[], pathname: string) {
  let best: { key: string; len: number } | null = null;
  for (const it of items) {
    const p = toPath(it.href);
    const hit = p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`);
    if (hit && (!best || p.length > best.len)) best = { key: it.key, len: p.length };
  }
  return best?.key;
}

function SideNav({
  tabs,
  shortcuts,
  profile,
  rail,
  width,
}: {
  tabs: SideNavItem[];
  shortcuts: SideNavItem[];
  profile?: SideNavProfile;
  rail: boolean;
  width: number;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const active = activeKey([...tabs, ...shortcuts], pathname);

  // 사이드바 선택 = 구역 이동: 쌓인 하위 화면을 걷고 그 구역을 연다
  const go = (item: SideNavItem, isTab: boolean) => {
    if (item.key === active && !router.canDismiss()) return;
    if (router.canDismiss()) router.dismissAll();
    if (isTab) router.navigate(item.href);
    else if (item.key !== active) router.push(item.href);
  };

  return (
    <View
      style={[
        s.nav,
        { width, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, space.x3), paddingLeft: insets.left },
      ]}>
      <View style={[s.brand, rail && s.brandRail]} accessibilityRole="header">
        <Image source={require('@/assets/images/icon.png')} style={s.logo} />
        {!rail && <Text variant="t7-bold">강한선배</Text>}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.list, rail && s.listRail]}
        showsVerticalScrollIndicator={false}
        accessibilityRole="tablist">
        {tabs.map((it) => (
          <NavRow key={it.key} item={it} active={it.key === active} rail={rail} onPress={() => go(it, true)} />
        ))}
        {!rail && shortcuts.length > 0 && (
          <>
            <Text variant="t3-bold" color="neutralSubtle" style={s.group}>
              바로가기
            </Text>
            {shortcuts.map((it) => (
              <NavRow key={it.key} item={it} active={it.key === active} rail={false} onPress={() => go(it, false)} />
            ))}
          </>
        )}
      </ScrollView>

      {profile && (
        <Press
          href={'/account' as Href}
          scale={0}
          pressedBg
          accessibilityLabel={`${profile.name}, 계정·보안`}
          style={[s.profile, rail && s.profileRail]}>
          <Avatar name={profile.name} size={36} />
          {!rail && (
            <>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="t4-bold" numberOfLines={1}>
                  {profile.name}
                </Text>
                <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1}>
                  {profile.caption}
                </Text>
              </View>
              <ChevronRight color={color.fg.neutralSubtle} size={18} strokeWidth={2.1} />
            </>
          )}
        </Press>
      )}
    </View>
  );
}

function NavRow({
  item,
  active,
  rail,
  onPress,
}: {
  item: SideNavItem;
  active: boolean;
  rail: boolean;
  onPress: () => void;
}) {
  const tint = active ? color.fg.neutral : color.fg.neutralMuted;
  const Icon = item.icon;
  const count = typeof item.badge === 'number' ? item.badge : 0;
  const icon = item.tabIcon ? (
    <TabIcon name={item.tabIcon} active={active} tint={tint} size={rail ? 26 : 22} />
  ) : Icon ? (
    <Icon color={tint} size={20} strokeWidth={active ? 2.3 : 2} />
  ) : null;

  return (
    <Press
      onPress={onPress}
      scale={0}
      pressedBg={active ? false : true}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={count > 0 ? `${item.label}, 새 항목 ${count}개` : item.label}
      style={[rail ? s.rowRail : s.row, active && s.rowActive]}>
      <View style={s.iconBox}>
        {icon}
        {rail && item.badge === 'dot' && <View style={s.dot} />}
        {rail && count > 0 && <CountBadge count={count} style={s.railCount} />}
      </View>
      {rail ? (
        <Text variant={active ? 't1-bold' : 't1-medium'} color={active ? 'neutral' : 'neutralSubtle'} numberOfLines={1}>
          {item.label}
        </Text>
      ) : (
        <>
          <Text
            variant={active ? 't5-bold' : 't5-medium'}
            color={active ? 'neutral' : 'neutralMuted'}
            numberOfLines={1}
            style={{ flex: 1 }}>
            {item.label}
          </Text>
          {item.badge === 'dot' && <View style={[s.dot, s.dotInline]} />}
          <CountBadge count={count} />
        </>
      )}
    </Press>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: color.bg.layerBasement },
  content: { flex: 1, minWidth: 0 },
  nav: {
    backgroundColor: color.bg.layerDefault,
    borderRightWidth: 1,
    borderRightColor: color.stroke.neutralSubtle,
  },
  brand: { height: 64, flexDirection: 'row', alignItems: 'center', gap: space.x2_5, paddingHorizontal: space.x5 },
  brandRail: { justifyContent: 'center', paddingHorizontal: 0 },
  logo: { width: 32, height: 32, borderRadius: radius.r2_5 },
  list: { paddingHorizontal: space.x3, paddingTop: space.x2, paddingBottom: space.x4, gap: space.x0_5 },
  listRail: { paddingHorizontal: space.x2, gap: space.x1 },
  group: { paddingHorizontal: space.x3, paddingTop: space.x6, paddingBottom: space.x2 },
  row: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    paddingHorizontal: space.x3,
    borderRadius: radius.r3,
  },
  rowRail: {
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x1,
    borderRadius: radius.r3,
  },
  rowActive: { backgroundColor: color.bg.neutralWeak },
  iconBox: { width: 26, alignItems: 'center' },
  dot: {
    position: 'absolute',
    top: -1,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: color.bg.brandSolid,
    borderWidth: 2,
    borderColor: color.bg.layerDefault,
  },
  dotInline: { position: 'relative', top: 0, right: 0, borderWidth: 0, width: 8, height: 8 },
  railCount: { position: 'absolute', top: -6, right: -12 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    marginHorizontal: space.x3,
    paddingHorizontal: space.x3,
    paddingVertical: space.x3,
    borderRadius: radius.r3,
  },
  profileRail: { justifyContent: 'center', marginHorizontal: space.x2, paddingHorizontal: 0 },
});
