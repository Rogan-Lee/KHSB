import { GraduationCap, Users } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import {
  color,
  EmptyState,
  ErrorState,
  radius,
  Screen,
  Section,
  Skeleton,
  space,
  Stack,
  Text,
} from '@/design';
import { useChildQuery } from '@/features/parent/child-query';
import { ExamSessionCard } from '@/features/parent/exam-session-card';
import { parentServicePaths, type ParentExamsResponse } from '@/lib/api/parent-services';
import { refreshBadges } from '@/lib/badges';
import { ChildChips, useParentChild } from '@/lib/parent-child';
import { useResponsive } from '@/lib/responsive';

/**
 * 학부모 모의고사 신청 — 접수 중인 시험 신청·취소 + 신청한 시험의 확정·좌석 배정 확인.
 * 웹 /s/[token]/exam 과 같은 신청 규칙. 접수가 닫힌 뒤의 확정·좌석까지 보여 준다.
 */
export default function ParentExamsScreen() {
  const { selected } = useParentChild();
  const { isTablet } = useResponsive();
  const childId = selected?.id ?? null;
  const q = useChildQuery<ParentExamsResponse>(childId ? parentServicePaths.exams(childId) : null, childId);
  const data = q.data;

  let body;
  if (!selected || !childId) {
    body = <EmptyState icon={Users} title="연결된 자녀가 없어요" description="자녀를 먼저 연결해 주세요." />;
  } else if (!data || q.isLoading) {
    body = q.error ? <ErrorState message={q.error} onRetry={q.retry} /> : <ExamsSkeleton />;
  } else if (data.sessions.length === 0) {
    body = (
      <Section>
        <EmptyState
          icon={GraduationCap}
          title="접수 중인 모의고사가 없어요"
          description="신청이 열리면 여기에서 바로 신청할 수 있어요."
          style={{ paddingVertical: space.x8 }}
        />
      </Section>
    );
  } else {
    body = (
      <>
        <Text variant="t5-regular" color="neutralMuted" style={s.intro}>
          {data.studentName} 학생이 응시할 모의고사를 골라 신청해 주세요. 운영진이 확인한 뒤 최종 확정돼요.
        </Text>
        {data.sessions.map((session) => (
          <ExamSessionCard
            key={`${childId}:${session.sessionId}`}
            session={session}
            studentId={childId}
            onChanged={() => {
              refreshBadges();
              void q.refresh();
            }}
          />
        ))}
      </>
    );
  }

  return (
    <Screen
      kind="push"
      title="모의고사 신청"
      backFallback="/(parent)/(tabs)/menu"
      refreshing={q.isRefreshing}
      onRefresh={childId ? () => void q.refresh() : undefined}
      maxWidth={isTablet ? 640 : undefined}>
      <Stack>
        <ChildChips />
        {body}
      </Stack>
    </Screen>
  );
}

function ExamsSkeleton() {
  return (
    <Stack>
      <Skeleton style={{ width: '85%', height: 18, marginHorizontal: space.x1, marginTop: space.x2 }} />
      {[0, 1].map((i) => (
        <View key={i} style={s.skel}>
          <Skeleton style={{ width: '70%', height: 22 }} />
          <Skeleton style={{ width: '50%', height: 16 }} />
          <View style={{ flexDirection: 'row', gap: space.x1 }}>
            {[0, 1, 2, 3].map((j) => (
              <Skeleton key={j} style={{ width: 44, height: 24, borderRadius: radius.r1_5 }} />
            ))}
          </View>
          <Skeleton style={{ height: 52, borderRadius: radius.r3 }} />
        </View>
      ))}
    </Stack>
  );
}

const s = StyleSheet.create({
  intro: { paddingHorizontal: space.x1, paddingTop: space.x2, paddingBottom: space.x1 },
  skel: { backgroundColor: color.bg.layerDefault, borderRadius: radius.r5, padding: space.x5, gap: space.x3 },
});
