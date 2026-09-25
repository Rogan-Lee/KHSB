import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, color, radius, Skeleton, space, Text } from '@/design';

// 학생 생활 화면 공용 조각 — 필드 묶음 라벨, 신청 버튼 묶음, 스켈레톤 카드.

/** 웹 SEED Fieldset(라벨 + 입력) — 라벨은 TextField 라벨과 같은 t5-medium */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.x2 }}>
      <Text variant="t5-medium">{label}</Text>
      {children}
    </View>
  );
}

/**
 * 신청 버튼 + 안내 문구 — 웹 BottomCTA(note + 버튼)와 같은 모양.
 * 폰은 Screen footer(하단 고정), 태블릿은 폼 아래에 그대로 둔다.
 */
export function SubmitBlock({
  note,
  label,
  loading,
  disabled,
  onPress,
}: {
  note?: string;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={{ gap: space.x2_5 }}>
      {note != null && (
        <Text variant="t3-regular" color="neutralSubtle" align="center">
          {note}
        </Text>
      )}
      <Button variant="primary" size="xl" block loading={loading} disabled={disabled} onPress={onPress}>
        {label}
      </Button>
    </View>
  );
}

/** 흰 카드 모양 스켈레톤 틀 */
export function SkeletonCard({ children, gap = space.x3 }: { children: ReactNode; gap?: number }) {
  return <View style={[s.card, { gap }]}>{children}</View>;
}

/** 스켈레톤 목록 행 (아이콘 + 두 줄 + 배지) */
export function SkeletonRow({ icon = true }: { icon?: boolean }) {
  return (
    <View style={s.row}>
      {icon && <Skeleton style={{ width: 40, height: 40, borderRadius: radius.r3 }} />}
      <View style={{ flex: 1, gap: space.x1_5 }}>
        <Skeleton style={{ width: '55%', height: 18 }} />
        <Skeleton style={{ width: '35%', height: 14 }} />
      </View>
      <Skeleton style={{ width: 48, height: 20 }} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.bg.layerDefault, borderRadius: radius.r5, padding: space.x5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
});
