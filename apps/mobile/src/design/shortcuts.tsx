import type { Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useResponsive } from '@/lib/responsive';

import { Press } from './press';
import { Text } from './text';
import { color, space, type Tone } from './tokens';
import { IconTile } from './ui';

export type Shortcut = {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  href?: Href;
  onPress?: () => void;
  /** 점 배지 (새 소식) */
  dot?: boolean;
};

/**
 * 홈 "바로가기" 그리드 — 학생·직원·학부모 홈 공통. 폰 4칸, 태블릿 6칸.
 */
export function ShortcutGrid({ items, columns }: { items: Shortcut[]; columns?: number }) {
  const { isTablet } = useResponsive();
  const cols = columns ?? (isTablet ? 6 : 4);
  return (
    <View style={s.grid}>
      {items.map((it) => (
        <View key={it.key} style={{ width: `${100 / cols}%` as `${number}%` }}>
          <Press
            href={it.href}
            onPress={it.onPress}
            scale={0.94}
            accessibilityRole="button"
            accessibilityLabel={it.dot ? `${it.label}, 새 소식 있음` : it.label}
            style={s.tile}>
            <View>
              <IconTile icon={it.icon} tone={it.tone} size={48} />
              {it.dot && <View style={s.dot} />}
            </View>
            <Text variant="t3-medium" color="neutralMuted" numberOfLines={1} align="center">
              {it.label}
            </Text>
          </Press>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.x3 },
  tile: { alignItems: 'center', gap: space.x2, paddingVertical: space.x1 },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.bg.brandSolid,
    borderWidth: 2,
    borderColor: color.bg.layerDefault,
  },
});
