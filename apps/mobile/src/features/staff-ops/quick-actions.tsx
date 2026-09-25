import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { IconTile, Press, radius, space, Text, type Tone } from '@/design';

export type QuickAction = {
  key: string;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  tone?: Tone;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/** 아이콘 타일 + 라벨 가로 묶음 — 전화·문자·상벌점 등 빠른 행동 (칸마다 같은 폭) */
export function QuickActionBar({ actions }: { actions: QuickAction[] }) {
  return (
    <View style={s.bar}>
      {actions.map((a) => (
        <View key={a.key} style={s.cell}>
          <Press
            onPress={a.onPress}
            disabled={a.disabled}
            scale={0.96}
            pressedBg
            accessibilityLabel={a.accessibilityLabel ?? a.label}
            accessibilityState={{ disabled: a.disabled }}
            style={[s.item, a.disabled && { opacity: 0.4 }]}>
            <IconTile icon={a.icon} tone={a.tone ?? 'gray'} size={44} round />
            <Text variant="t3-medium" color="neutralMuted" align="center" numberOfLines={1}>
              {a.label}
            </Text>
          </Press>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', gap: space.x1 },
  cell: { flex: 1, minWidth: 0 },
  item: {
    alignItems: 'center',
    gap: space.x1_5,
    paddingVertical: space.x2,
    borderRadius: radius.r3,
  },
});
