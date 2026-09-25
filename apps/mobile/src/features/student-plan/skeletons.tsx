import { View } from 'react-native';

import { radius, Section, Skeleton, space, Stack } from '@/design';

/** 내 일정 첫 로드 — 오늘/내일/이번 주 칸 + 일정 카드 + 공부 계획 카드 */
export function MyScheduleSkeleton() {
  return (
    <Stack>
      <Skeleton style={{ height: 44, borderRadius: radius.full }} />
      <Section>
        <Skeleton style={{ width: 150, height: 22 }} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.x3, marginTop: space.x4 }}>
            <Skeleton style={{ width: 4, height: 36, borderRadius: radius.full }} />
            <View style={{ flex: 1, gap: space.x1_5 }}>
              <Skeleton style={{ width: '50%', height: 16 }} />
              <Skeleton style={{ width: '30%', height: 14 }} />
            </View>
          </View>
        ))}
      </Section>
      <Section>
        <Skeleton style={{ width: 90, height: 22 }} />
        <Skeleton style={{ height: 52, marginTop: space.x4, borderRadius: radius.r3 }} />
      </Section>
    </Stack>
  );
}

/** 등원 스케줄 첫 로드 — 안내 + 요일 버튼 + 시간 카드 */
export function ScheduleSubmitSkeleton() {
  return (
    <Stack>
      <View style={{ gap: space.x2, paddingHorizontal: space.x1, paddingTop: space.x3 }}>
        <Skeleton style={{ width: '70%', height: 24 }} />
        <Skeleton style={{ width: '90%', height: 16 }} />
      </View>
      <Section>
        <Skeleton style={{ width: 110, height: 22 }} />
        <View style={{ flexDirection: 'row', gap: space.x1, marginTop: space.x4 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} style={{ flex: 1, aspectRatio: 1, borderRadius: radius.full }} />
          ))}
        </View>
        <Skeleton style={{ height: 96, marginTop: space.x4, borderRadius: radius.r4 }} />
      </Section>
    </Stack>
  );
}

/** 모의고사 첫 로드 — 회차 카드 두 장 */
export function ExamsSkeleton() {
  return (
    <Stack>
      <Skeleton style={{ width: '80%', height: 18, marginTop: space.x3, marginHorizontal: space.x1 }} />
      {[0, 1].map((i) => (
        <Section key={i}>
          <Skeleton style={{ width: '60%', height: 22 }} />
          <Skeleton style={{ width: '40%', height: 16, marginTop: space.x2 }} />
          <View style={{ flexDirection: 'row', gap: space.x1, marginTop: space.x3 }}>
            {[0, 1, 2, 3].map((j) => (
              <Skeleton key={j} style={{ width: 40, height: 20, borderRadius: radius.r1 }} />
            ))}
          </View>
          <Skeleton style={{ height: 52, marginTop: space.x4, borderRadius: radius.r3 }} />
        </Section>
      ))}
    </Stack>
  );
}
