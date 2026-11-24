import { useRouter, type Href } from 'expo-router';
import { Check, CircleCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  color,
  ErrorState,
  ListRow,
  Notice,
  Screen,
  Section,
  Skeleton,
  space,
  Stack,
  Text,
} from '@/design';
import { entryStepHref, useEntryOnboarding } from '@/lib/api/student-onboarding';

/** 입실 준비 — 단계 목록. 각 행을 눌러 내고, "나중에 할게요"로 홈에 돌아간다 */
export default function EntryOnboardingScreen() {
  const router = useRouter();
  const { data, error, isLoading, isRefreshing, refresh, retry } = useEntryOnboarding();
  const steps = data?.steps ?? [];
  const allDone = steps.length > 0 && steps.every((st) => st.done);

  const goHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(student)/(tabs)' as Href);
  };

  let body;
  if (!data && isLoading) {
    body = (
      <Section flush>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={s.skeletonRow}>
            <Skeleton style={{ width: 32, height: 32, borderRadius: 16 }} />
            <Skeleton style={{ height: 18, width: '45%' }} />
          </View>
        ))}
      </Section>
    );
  } else if (!data) {
    body = <ErrorState message={error ?? undefined} onRetry={() => void retry()} />;
  } else {
    body = (
      <Section flush>
        {steps.map((st, i) => (
          <ListRow
            key={st.key}
            href={entryStepHref(st.key)}
            leading={<StepMark index={i} done={st.done} />}
            title={st.label}
            description={
              <Text variant="t4-regular" color={st.done ? 'positive' : 'neutralSubtle'}>
                {st.done ? '완료' : '남음'}
              </Text>
            }
          />
        ))}
      </Section>
    );
  }

  return (
    <Screen
      kind="push"
      title="입실 준비"
      backFallback="/(student)"
      refreshing={isRefreshing}
      onRefresh={data ? () => void refresh() : undefined}
      footer={
        <Button variant="gray" size="xl" block onPress={goHome}>
          {allDone ? '홈으로' : '나중에 할게요'}
        </Button>
      }>
      <Stack>
        <Text variant="t5-regular" color="neutralMuted" style={s.lead}>
          멘토 배정과 학습 관리에 쓰여요. 하나씩 나눠서 내도 돼요.
        </Text>
        {body}
        {allDone && (
          <Notice tone="ok" icon={CircleCheck} title="모두 냈어요">
            고칠 게 있으면 항목을 눌러 다시 내 주세요.
          </Notice>
        )}
      </Stack>
    </Screen>
  );
}

/** 단계 번호 동그라미 — 내면 초록 체크 (초기 설문 목록과 같은 모양) */
function StepMark({ index, done }: { index: number; done: boolean }) {
  return (
    <View
      style={[s.mark, { backgroundColor: done ? color.bg.positiveSolid : color.bg.neutralWeak }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {done ? (
        <Check color={color.palette.staticWhite} size={16} strokeWidth={3} />
      ) : (
        <Text variant="t4-bold" color="neutralSubtle" tabular>
          {index + 1}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  lead: { paddingHorizontal: space.x1, paddingTop: space.x3 },
  mark: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    marginHorizontal: space.x2,
    paddingHorizontal: space.x3,
    paddingVertical: space.x3,
  },
});
