import { ClipboardList } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { color, EmptyState, ErrorState, radius, Screen, Section, Skeleton, space, Stack, Text } from '@/design';
import { InstructionItem } from '@/features/student-instructions/instruction-item';
import { STUDENT_INSTRUCTIONS_PATH, type StudentInstructionsResponse } from '@/lib/api/instructions';
import { refreshBadges } from '@/lib/badges';
import { useMobileQuery } from '@/lib/mobile-api';

// 선생님 지시 — 운영진이 보낸 짧은 지시를 최신순으로 보고 [확인했어요]를 누른다.
// 푸시(/(student)/instructions)·홈 "선생님 지시" 섹션·전체 탭에서 들어온다.

export default function StudentInstructionsScreen() {
  const { data, error, isRefreshing, refresh, retry } =
    useMobileQuery<StudentInstructionsResponse>(STUDENT_INSTRUCTIONS_PATH);

  const onAcked = () => {
    void refresh();
    refreshBadges();
  };

  const items = data?.items ?? [];

  return (
    <Screen
      kind="push"
      title="선생님 지시"
      backFallback="/(student)/(tabs)"
      refreshing={isRefreshing}
      onRefresh={() => void refresh()}>
      {!data ? (
        error ? (
          <ErrorState message={error} onRetry={() => void retry()} />
        ) : (
          <InstructionsSkeleton />
        )
      ) : items.length === 0 ? (
        <Section>
          <EmptyState
            icon={ClipboardList}
            tone="brand"
            title="아직 받은 지시가 없어요"
            description="선생님이 지시를 보내면 여기에서 알려 드려요."
            style={{ paddingVertical: space.x10 }}
          />
        </Section>
      ) : (
        <Stack>
          <Text variant="t4-regular" color="neutralSubtle" style={s.intro}>
            선생님이 보낸 지시예요. 읽고 나면 [확인했어요]를 눌러 주세요.
          </Text>
          {items.map((item) => (
            <Section key={item.id}>
              <InstructionItem item={item} onAcked={onAcked} />
            </Section>
          ))}
        </Stack>
      )}
    </Screen>
  );
}

function InstructionsSkeleton() {
  return (
    <Stack>
      <Skeleton style={{ width: '85%', height: 16, marginTop: space.x2, marginLeft: space.x1 }} />
      {[0, 1].map((i) => (
        <View key={i} style={s.skeletonCard}>
          <Skeleton style={{ width: '100%', height: 18 }} />
          <Skeleton style={{ width: '70%', height: 18 }} />
          <Skeleton style={{ width: 140, height: 14 }} />
          <Skeleton style={{ height: 40, marginTop: space.x1, borderRadius: radius.r2 }} />
        </View>
      ))}
    </Stack>
  );
}

const s = StyleSheet.create({
  intro: { paddingHorizontal: space.x1, paddingTop: space.x2 },
  skeletonCard: {
    backgroundColor: color.bg.layerDefault,
    borderRadius: radius.r5,
    padding: space.x5,
    gap: space.x3,
  },
});
