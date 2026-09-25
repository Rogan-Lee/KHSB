import { GraduationCap } from 'lucide-react-native';

import {
  Columns,
  EmptyState,
  ErrorState,
  Screen,
  Section,
  space,
  Stack,
  TABLET_WIDE,
  Text,
  useResponsive,
} from '@/design';
import { ExamCard } from '@/features/student-plan/exam-card';
import { ExamsSkeleton } from '@/features/student-plan/skeletons';
import {
  STUDENT_EXAMS_PATH,
  type StudentExamSession,
  type StudentExamsResponse,
} from '@/lib/api/student-plan';
import { useMobileQuery } from '@/lib/mobile-api';

// 웹 학생 포털 /s/[token]/exam(ExamApplicationForm portal)과 같은 구성: 안내 문구 → 회차 카드(신청·취소).
// 앱은 접수가 닫혔어도 내가 신청했거나 좌석을 받은 다가오는 시험을 함께 보여 준다(확정·좌석 확인용).
// 태블릿: 회차가 둘 이상이면 두 칸으로.

export default function StudentExamsScreen() {
  const { isTablet } = useResponsive();
  const { data, error, isRefreshing, refresh, retry } =
    useMobileQuery<StudentExamsResponse>(STUDENT_EXAMS_PATH);
  const sessions = data?.sessions ?? [];
  const twoCol = isTablet && sessions.length > 1;

  const card = (s: StudentExamSession) => (
    <ExamCard key={s.sessionId} session={s} onChanged={() => void refresh()} />
  );

  return (
    <Screen
      kind="push"
      title="모의고사 신청"
      backFallback="/(student)/(tabs)/menu"
      refreshing={isRefreshing}
      onRefresh={() => void refresh()}
      maxWidth={twoCol ? TABLET_WIDE : undefined}>
      {!data ? (
        error ? (
          <ErrorState message={error} onRetry={() => void retry()} />
        ) : (
          <ExamsSkeleton />
        )
      ) : (
        <Stack>
          <Text
            variant="t5-regular"
            color="neutralMuted"
            style={{ paddingHorizontal: space.x1, paddingBottom: space.x1, paddingTop: space.x3 }}>
            응시할 모의고사를 골라 신청해 주세요. 운영진이 확인한 뒤 최종 확정돼요.
          </Text>

          {sessions.length === 0 ? (
            <Section>
              <EmptyState
                icon={GraduationCap}
                tone="violet"
                title="접수 중인 모의고사가 없어요"
                description="신청이 열리면 여기에서 바로 신청할 수 있어요."
                style={{ paddingVertical: space.x8 }}
              />
            </Section>
          ) : twoCol ? (
            <Columns
              leftFlex={1}
              left={sessions.filter((_, i) => i % 2 === 0).map(card)}
              right={sessions.filter((_, i) => i % 2 === 1).map(card)}
            />
          ) : (
            sessions.map(card)
          )}
        </Stack>
      )}
    </Screen>
  );
}
