import type { Href } from 'expo-router';
import { BookOpenCheck, ClipboardList, UserPlus } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';

import { TwoPane } from '@/components/two-pane';
import {
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Screen,
  Section,
  Segmented,
  space,
  Stack,
  StatGrid,
  useMasterDetail,
} from '@/design';
import { ListSkeleton, StatSkeleton } from '@/features/staff-learning/skeletons';
import {
  AttemptRow,
  AttemptSheet,
  ExamRow,
  useVocabAttemptActions,
  VocabExamView,
} from '@/features/staff-learning/vocab-ui';
import {
  STAFF_VOCAB_PATH,
  type StaffVocabAttempt,
  type StaffVocabOverviewResponse,
} from '@/lib/api/staff-learning';
import { useMobileQuery } from '@/lib/mobile-api';

type Tab = 'attempts' | 'exams';
type AttemptFilter = 'all' | 'waiting' | 'submitted';

const ASSIGN_HREF = '/(staff)/vocab/assign' as Href;
const examHref = (id: string) => `/(staff)/vocab/${id}` as Href;

/** 영단어 시험 관리 — 최근 응시·점수, 시험 목록, 배정 */
export default function StaffVocabScreen() {
  const [view, setView] = useState<Tab>('attempts');
  const [filter, setFilter] = useState<AttemptFilter>('all');
  const [sheet, setSheet] = useState<StaffVocabAttempt | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const q = useMobileQuery<StaffVocabOverviewResponse>(STAFF_VOCAB_PATH);
  const md = useMasterDetail(examHref);
  const actions = useVocabAttemptActions(() => void q.refresh());
  const data = q.data;

  const attempts = (data?.attempts ?? []).filter((a) =>
    filter === 'waiting'
      ? a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS'
      : filter === 'submitted'
        ? a.status === 'SUBMITTED'
        : true,
  );

  let body: ReactNode;
  if (!data) {
    body =
      q.error && !q.isLoading ? (
        <ErrorState message={q.error} onRetry={() => void q.retry()} />
      ) : (
        <>
          <StatSkeleton cells={4} />
          <ListSkeleton rows={6} />
        </>
      );
  } else {
    body = (
      <>
        <Section>
          <StatGrid
            surface="plain"
            items={[
              { label: '미응시', value: data.summary.waiting, tone: data.summary.waiting > 0 ? 'warning' : 'neutral' },
              { label: '응시 중', value: data.summary.inProgress, tone: 'informative' },
              { label: '이번 주 제출', value: data.summary.submittedThisWeek, tone: 'positive' },
              {
                label: '이번 주 평균',
                value: data.summary.avgScoreThisWeek != null ? `${data.summary.avgScoreThisWeek}점` : '-',
              },
            ]}
          />
        </Section>

        <Segmented
          options={[
            { value: 'attempts', label: '최근 응시' },
            { value: 'exams', label: '시험' },
          ]}
          value={view}
          onChange={setView}
        />

        {view === 'attempts' ? (
          <>
            <ChipGroup>
              <Chip size="sm" selected={filter === 'all'} onPress={() => setFilter('all')}>
                전체
              </Chip>
              <Chip size="sm" selected={filter === 'waiting'} onPress={() => setFilter('waiting')}>
                대기
              </Chip>
              <Chip size="sm" selected={filter === 'submitted'} onPress={() => setFilter('submitted')}>
                제출
              </Chip>
            </ChipGroup>
            <Section flush>
              {attempts.length === 0 ? (
                <EmptyState
                  icon={BookOpenCheck}
                  title={filter === 'all' ? '아직 응시 기록이 없어요' : '해당하는 응시가 없어요'}
                  description="시험을 학생에게 배정하면 여기서 응시와 점수를 볼 수 있어요."
                  style={{ paddingVertical: space.x10 }}
                />
              ) : (
                attempts.map((a) => (
                  <AttemptRow
                    key={a.id}
                    attempt={a}
                    onPress={() => {
                      setSheet(a);
                      setSheetOpen(true);
                    }}
                  />
                ))
              )}
            </Section>
          </>
        ) : (
          <Section flush>
            {data.exams.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="출제한 시험이 없어요"
                description="새 시험 출제는 웹 영단어 화면에서 할 수 있어요."
                style={{ paddingVertical: space.x10 }}
              />
            ) : (
              data.exams.map((exam) => (
                <ExamRow
                  key={exam.id}
                  exam={exam}
                  selected={md.selectedId === exam.id}
                  onPress={() => md.open(exam.id)}
                />
              ))
            )}
          </Section>
        )}
      </>
    );
  }

  const master = (
    <Screen
      kind="push"
      title="영단어 시험"
      backFallback="/(staff)/(tabs)"
      refreshing={q.isRefreshing}
      onRefresh={() => void q.refresh()}
      footer={
        data && data.exams.length > 0 ? (
          <Button variant="primary" size="lg" block icon={UserPlus} href={ASSIGN_HREF}>
            학생에게 시험 배정
          </Button>
        ) : undefined
      }>
      <Stack>{body}</Stack>
      <AttemptSheet
        attempt={sheet}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onShare={(a) => void actions.share(a).then(() => setSheetOpen(false))}
        onReissue={(a) => void actions.reissue(a)}
      />
    </Screen>
  );

  return (
    <TwoPane
      master={master}
      detail={
        md.selectedId ? (
          <VocabExamView
            key={md.selectedId}
            examId={md.selectedId}
            inline
            onClose={md.close}
            onChanged={() => void q.refresh()}
          />
        ) : null
      }
      detailVisible={!!md.selectedId}
      onCloseDetail={md.close}
      emptyTitle="시험을 골라 주세요"
      emptyMessage="'시험' 목록에서 시험을 고르면 학생별 응시 현황을 볼 수 있어요."
    />
  );
}
