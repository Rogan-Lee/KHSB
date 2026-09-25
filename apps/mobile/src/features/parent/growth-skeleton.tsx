import { View } from 'react-native';

import { Section, Skeleton, space, Stack } from '@/design';

/** 성장 탭 첫 로드 — 요약 카드(숫자 칸) + 그래프 카드 + 목록 카드 모양 */
export function GrowthSkeleton() {
  return (
    <Stack>
      <Section>
        <Skeleton style={{ width: 140, height: 22 }} />
        <Skeleton style={{ width: 96, height: 32, marginTop: space.x4 }} />
        <Skeleton style={{ width: '100%', height: 160, marginTop: space.x4, borderRadius: 12 }} />
      </Section>
      <Section>
        <Skeleton style={{ width: 100, height: 22 }} />
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{ flexDirection: 'row', gap: space.x3, alignItems: 'center', marginTop: space.x4 }}>
            <Skeleton style={{ width: 40, height: 40, borderRadius: 12 }} />
            <View style={{ flex: 1, gap: space.x1_5 }}>
              <Skeleton style={{ width: '65%', height: 16 }} />
              <Skeleton style={{ width: '40%', height: 14 }} />
            </View>
          </View>
        ))}
      </Section>
    </Stack>
  );
}
