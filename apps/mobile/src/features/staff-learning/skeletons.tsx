import { View } from 'react-native';

import { Section, Skeleton, space, Stack } from '@/design';

/** 요약 카드 모양 (StatGrid) */
export function StatSkeleton({ cells = 3 }: { cells?: number }) {
  return (
    <Section>
      <View style={{ flexDirection: 'row', gap: space.x3 }}>
        {Array.from({ length: cells }, (_, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: space.x2 }}>
            <Skeleton style={{ width: 44, height: 12 }} />
            <Skeleton style={{ width: 32, height: 22 }} />
          </View>
        ))}
      </View>
    </Section>
  );
}

/** 리스트 카드 모양 — 제목 줄 + 행들(아이콘·두 줄·오른쪽 배지) */
export function ListSkeleton({ rows = 4, title = true }: { rows?: number; title?: boolean }) {
  return (
    <Section flush title={title ? <Skeleton style={{ width: 96, height: 18 }} /> : undefined}>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
            paddingHorizontal: space.x5,
            paddingVertical: space.x3,
          }}>
          <Skeleton style={{ width: 40, height: 40, borderRadius: 20 }} />
          <View style={{ flex: 1, gap: space.x1_5 }}>
            <Skeleton style={{ width: '46%', height: 16 }} />
            <Skeleton style={{ width: '70%', height: 12 }} />
          </View>
          <Skeleton style={{ width: 48, height: 20 }} />
        </View>
      ))}
    </Section>
  );
}

/** 상세(폼) 모양 — 머리 + 입력칸들 */
export function DetailSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <Stack gap={space.x5}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
        <Skeleton style={{ width: 48, height: 48, borderRadius: 24 }} />
        <View style={{ flex: 1, gap: space.x2 }}>
          <Skeleton style={{ width: '40%', height: 20 }} />
          <Skeleton style={{ width: '60%', height: 14 }} />
        </View>
      </View>
      <Skeleton style={{ height: 56, borderRadius: 10 }} />
      {Array.from({ length: fields }, (_, i) => (
        <View key={i} style={{ gap: space.x2 }}>
          <Skeleton style={{ width: 120, height: 16 }} />
          <Skeleton style={{ height: 96, borderRadius: 12 }} />
        </View>
      ))}
    </Stack>
  );
}
