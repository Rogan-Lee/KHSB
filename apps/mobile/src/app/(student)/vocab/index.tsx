import type { Href } from 'expo-router';
import { AlarmClock, BookOpen, Check, Clock, History, SpellCheck } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  color,
  Columns,
  EmptyState,
  ErrorState,
  IconTile,
  ListRow,
  Screen,
  Section,
  Skeleton,
  space,
  Stack,
  StatGrid,
  TABLET_CONTENT_WIDTH,
  TABLET_WIDE,
  Text,
  useResponsive,
} from '@/design';
import { formatMonthDay } from '@/features/student-tasks/status';
import {
  fmtScore,
  VOCAB_PASS_SCORE,
  vocabDueLabel,
  vocabExamMeta,
} from '@/features/student-vocab/format';
import {
  STUDENT_VOCAB_PATH,
  type StudentVocabItem,
  type StudentVocabList,
} from '@/lib/api/student-learning';
import { useMobileQuery } from '@/lib/mobile-api';

const attemptRoute = (id: string) => `/(student)/vocab/${id}` as Href;

/**
 * 영단어 시험 목록 — 웹 포털 /s/[token]/vocab 과 같은 구성.
 *  "응시할 시험이 N건 있어요" → 응시할 시험 카드(시험 보기/이어서 풀기) → 완료·평균·최근 → 지난 시험.
 * 태블릿(≥700): 왼쪽 응시할 시험, 오른쪽 성적 요약 + 지난 시험.
 */
export default function StudentVocabListScreen() {
  const { isTablet } = useResponsive();
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StudentVocabList>(STUDENT_VOCAB_PATH);

  return (
    <Screen
      kind="push"
      title="영단어 시험"
      backFallback="/(student)/(tabs)/menu"
      maxWidth={isTablet ? TABLET_WIDE : undefined}
      refreshing={isRefreshing}
      onRefresh={() => void refresh()}>
      {data ? (
        <VocabList items={data.items} isTablet={isTablet} />
      ) : isLoading || !error ? (
        <ListSkeleton isTablet={isTablet} />
      ) : (
        <Centered isTablet={isTablet}>
          <ErrorState message={error} onRetry={() => void retry()} />
        </Centered>
      )}
    </Screen>
  );
}

/** 태블릿 넓은 화면에서 한 단짜리 상태(빈 목록·오류)는 기본 폭으로 가운데 */
function Centered({ isTablet, children }: { isTablet: boolean; children: ReactNode }) {
  if (!isTablet) return <>{children}</>;
  return <View style={s.centered}>{children}</View>;
}

function VocabList({ items, isTablet }: { items: StudentVocabItem[]; isTablet: boolean }) {
  if (items.length === 0) {
    return (
      <Centered isTablet={isTablet}>
        <Section style={{ marginTop: space.x2 }}>
          <EmptyState
            icon={SpellCheck}
            title="아직 배정된 영단어 시험이 없어요"
            description="선생님이 시험을 배정하면 여기에 보여요."
          />
        </Section>
      </Centered>
    );
  }

  const open = [
    ...items.filter((a) => a.status === 'IN_PROGRESS'),
    ...items.filter((a) => a.status === 'ASSIGNED'),
  ];
  const done = items
    .filter((a) => a.status === 'SUBMITTED')
    .sort(
      (x, y) =>
        new Date(y.submittedAt ?? y.assignedAt).getTime() -
        new Date(x.submittedAt ?? x.assignedAt).getTime(),
    );
  const avgScore =
    done.length > 0 ? fmtScore(done.reduce((sum, a) => sum + (a.score ?? 0), 0) / done.length) : 0;
  const latestScore = done.length > 0 ? fmtScore(done[0].score) : 0;

  const headline = (
    <View key="headline" style={s.headline}>
      <Text variant="t8-bold">
        {open.length > 0 ? (
          <>
            응시할 시험이{' '}
            <Text variant="t8-bold" color="brand" tabular>
              {open.length}건
            </Text>{' '}
            있어요
          </>
        ) : (
          '응시할 시험이 없어요'
        )}
      </Text>
      <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x1 }}>
        {open.length > 0 ? '한 번 제출한 시험은 다시 볼 수 없어요' : '새 시험이 배정되면 여기에 보여요'}
      </Text>
    </View>
  );

  const openCards = open.map((a) => <OpenExamCard key={a.id} attempt={a} />);

  const stats =
    done.length > 0 ? (
      <Section key="stats">
        <StatGrid
          surface="plain"
          items={[
            { label: '완료', value: `${done.length}개` },
            { label: '평균', value: `${avgScore}점` },
            { label: '최근', value: `${latestScore}점` },
          ]}
        />
      </Section>
    ) : null;

  const history =
    done.length > 0 ? (
      <Section key="history" title="지난 시험" flush>
        {done.map((a) => {
          const score = fmtScore(a.score);
          const pass = score >= VOCAB_PASS_SCORE;
          return (
            <ListRow
              key={a.id}
              href={attemptRoute(a.id)}
              leading={<IconTile icon={pass ? Check : BookOpen} tone={pass ? 'ok' : 'warn'} size={44} round />}
              title={a.title}
              description={
                <Text variant="t4-regular" color="neutralSubtle" tabular>
                  {a.correctCount}/{a.totalQuestions} 정답
                  {a.submittedAt ? ` · ${formatMonthDay(a.submittedAt)}` : ''}
                </Text>
              }
              trailing={
                <Text variant="t5-bold" color={pass ? 'positive' : 'warning'} tabular>
                  {score}점
                </Text>
              }
            />
          );
        })}
      </Section>
    ) : null;

  if (isTablet) {
    return (
      <Columns
        left={[headline, ...openCards]}
        right={
          done.length > 0 ? (
            [stats, history]
          ) : (
            <Section>
              <EmptyState
                icon={History}
                title="아직 제출한 시험이 없어요"
                description="시험을 제출하면 점수와 기록이 여기에 모여요."
              />
            </Section>
          )
        }
      />
    );
  }

  return (
    <Stack>
      {headline}
      {openCards}
      {stats}
      {history}
    </Stack>
  );
}

function OpenExamCard({ attempt: a }: { attempt: StudentVocabItem }) {
  const inProgress = a.status === 'IN_PROGRESS';
  const due = vocabDueLabel(a.expiresAt);
  return (
    <Section>
      <View style={s.cardTop}>
        <IconTile icon={inProgress ? Clock : SpellCheck} tone={inProgress ? 'warn' : 'brand'} size={48} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.titleRow}>
            <Text variant="t6-bold" style={{ flex: 1, minWidth: 0 }}>
              {a.title}
            </Text>
            <Badge tone={inProgress ? 'warn' : 'brand'} style={{ marginTop: space.x0_5 }}>
              {inProgress ? '푸는 중' : '새 시험'}
            </Badge>
          </View>
          <Text variant="t4-regular" color="neutralSubtle" tabular style={{ marginTop: space.x1 }}>
            {vocabExamMeta(a.questionCount, a.perQuestionSeconds)}
          </Text>
          {due && (
            <View style={s.due}>
              <AlarmClock
                color={due.urgent ? color.fg.critical : color.fg.warning}
                size={14}
                strokeWidth={2.4}
              />
              <Text variant="t3-bold" color={due.urgent ? 'critical' : 'warning'} tabular>
                {due.label}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Button
        href={attemptRoute(a.id)}
        variant="primary"
        size="lg"
        block
        style={{ marginTop: space.x4 }}
        accessibilityLabel={`${a.title} ${inProgress ? '이어서 풀기' : '시험 보기'}`}>
        {inProgress ? '이어서 풀기' : '시험 보기'}
      </Button>
    </Section>
  );
}

function ListSkeleton({ isTablet }: { isTablet: boolean }) {
  const headline = (
    <View key="headline" style={s.headline}>
      <Skeleton style={{ width: '70%', height: 30 }} />
      <Skeleton style={{ width: '52%', height: 18, marginTop: space.x2 }} />
    </View>
  );
  const card = (
    <Section key="card">
      <View style={s.cardTop}>
        <Skeleton style={{ width: 48, height: 48, borderRadius: 16 }} />
        <View style={{ flex: 1, gap: space.x2 }}>
          <Skeleton style={{ width: '60%', height: 22 }} />
          <Skeleton style={{ width: '80%', height: 16 }} />
        </View>
      </View>
      <Skeleton style={{ height: 52, marginTop: space.x4, borderRadius: 12 }} />
    </Section>
  );
  const rows = (
    <Section key="rows" flush>
      {[0, 1, 2].map((i) => (
        <View key={i} style={s.skeletonRow}>
          <Skeleton style={{ width: 44, height: 44, borderRadius: 22 }} />
          <View style={{ flex: 1, gap: space.x1_5 }}>
            <Skeleton style={{ width: '64%', height: 20 }} />
            <Skeleton style={{ width: '40%', height: 16 }} />
          </View>
          <Skeleton style={{ width: 40, height: 20 }} />
        </View>
      ))}
    </Section>
  );
  if (isTablet) return <Columns left={[headline, card]} right={rows} />;
  return (
    <Stack>
      {headline}
      {card}
      {rows}
    </Stack>
  );
}

const s = StyleSheet.create({
  centered: { width: '100%', maxWidth: TABLET_CONTENT_WIDTH, alignSelf: 'center' },
  headline: { paddingHorizontal: space.x1, paddingBottom: space.x2, paddingTop: space.x3 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x3_5 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.x2 },
  due: { flexDirection: 'row', alignItems: 'center', gap: space.x1, marginTop: space.x1_5 },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    marginHorizontal: space.x2,
    paddingHorizontal: space.x3,
    paddingVertical: space.x3,
  },
});
