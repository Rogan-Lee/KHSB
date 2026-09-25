import { View } from 'react-native';

import { Columns, radius, Section, Skeleton, space, Stack, useResponsive } from '@/design';

/** 월간 리포트가 뜨기 전 — 머리글(이름·요약 칸) + 본문 카드 모양 */
export function MonthlyReportSkeleton() {
  const { isTablet } = useResponsive();
  const card = (key: number, lines: number) => (
    <Section key={key}>
      <Skeleton style={{ width: 150, height: 22 }} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          style={{ width: i === lines - 1 ? '64%' : '100%', height: 16, marginTop: i === 0 ? space.x4 : space.x2 }}
        />
      ))}
    </Section>
  );
  return (
    <View accessibilityLabel="월간 리포트를 불러오고 있어요" style={{ gap: space.x3 }}>
      <View style={{ paddingHorizontal: space.x1, paddingTop: space.x4, paddingBottom: space.x3 }}>
        <Skeleton style={{ width: 150, height: 16 }} />
        <Skeleton style={{ width: 170, height: 32, marginTop: space.x2 }} />
        <Skeleton style={{ width: 210, height: 18, marginTop: space.x2 }} />
        <Skeleton style={{ width: '100%', height: 84, marginTop: space.x5, borderRadius: radius.r5 }} />
      </View>
      {isTablet ? (
        <Columns left={[card(0, 5), card(1, 3)]} right={[card(2, 6), card(3, 2)]} />
      ) : (
        <Stack>{[card(0, 5), card(1, 3), card(2, 4)]}</Stack>
      )}
    </View>
  );
}
