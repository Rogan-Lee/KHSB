import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from './press';
import { TAB_BAR_HEIGHT } from './screen';
import { TabIcon, type TabIconName } from './tab-icons';
import { Text } from './text';
import { color, CONTENT_MAX_WIDTH } from './tokens';

export type TabItem = {
  label: string;
  icon: TabIconName;
  /** 숫자 배지 (0 이면 숨김) 또는 점 배지 */
  badge?: number | 'dot';
};

/**
 * SEED 하단 탭바 — 웹 학생 포털 PortalTabBar 와 같은 모양.
 * items 에 없는 라우트(숨김 화면)는 그리지 않는다.
 */
export function SeedTabBar({
  state,
  navigation,
  items,
}: BottomTabBarProps & { items: Record<string, TabItem> }) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => items[r.name]);
  const focusedName = state.routes[state.index]?.name;

  return (
    <View style={[s.bar, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      <View style={s.row}>
        {routes.map((route) => {
          const item = items[route.name];
          const active = route.name === focusedName;
          const tint = active ? color.fg.neutral : color.fg.placeholder;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!active && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Press
              key={route.key}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              scale={0.92}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={
                typeof item.badge === 'number' && item.badge > 0
                  ? `${item.label}, 새 항목 ${item.badge}개`
                  : item.label
              }
              style={s.item}>
              <View>
                <TabIcon name={item.icon} active={active} tint={tint} />
                {item.badge === 'dot' ? (
                  <View style={s.dot} />
                ) : item.badge != null && item.badge > 0 ? (
                  <View style={s.count}>
                    <Text variant="t1-bold" color="staticWhite" tabular style={{ fontSize: 10, lineHeight: 13 }}>
                      {item.badge > 9 ? '9+' : item.badge}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text variant={active ? 't1-bold' : 't1-medium'} color={active ? 'neutral' : 'neutralSubtle'}>
                {item.label}
              </Text>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    backgroundColor: color.bg.layerDefault,
    borderTopWidth: 1,
    borderTopColor: color.stroke.neutralSubtle,
  },
  row: {
    height: TAB_BAR_HEIGHT,
    flexDirection: 'row',
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH + 120,
    alignSelf: 'center',
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dot: {
    position: 'absolute',
    top: -1,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: color.bg.brandSolid,
    borderWidth: 2,
    borderColor: color.bg.layerDefault,
  },
  count: {
    position: 'absolute',
    top: -4,
    right: -9,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: color.bg.brandSolid,
    borderWidth: 2,
    borderColor: color.bg.layerDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
