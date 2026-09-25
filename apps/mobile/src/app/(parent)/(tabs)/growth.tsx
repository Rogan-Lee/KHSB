import { UserRound } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';

import { EmptyState, ErrorState, Screen, SegmentTabs, Stack } from '@/design';
import { GrowthExams } from '@/features/parent/growth-exams';
import { GrowthLife } from '@/features/parent/growth-life';
import { GrowthSkeleton } from '@/features/parent/growth-skeleton';
import { GrowthTasks } from '@/features/parent/growth-tasks';
import { GrowthVocab } from '@/features/parent/growth-vocab';
import {
  parentGrowthPath,
  useParentQuery,
  type GrowthSection,
  type ParentExamsResponse,
  type ParentMeritsResponse,
  type ParentQuery,
  type ParentTasksResponse,
  type ParentVocabResponse,
} from '@/lib/api/parent-reports';
import { ChildSwitcher, useParentChild } from '@/lib/parent-child';
import { useResponsive } from '@/lib/responsive';

const TABS: { value: GrowthSection; label: string }[] = [
  { value: 'exams', label: '성적' },
  { value: 'vocab', label: '영단어' },
  { value: 'merits', label: '생활' },
  { value: 'tasks', label: '과제' },
];

function Panel<T>({ q, children }: { q: ParentQuery<T>; children: (data: T) => ReactNode }) {
  if (q.data) return <>{children(q.data)}</>;
  if (q.error) return <ErrorState message={q.error} onRetry={q.retry} />;
  return <GrowthSkeleton />;
}

/** 학부모 성장 탭 — 성적 · 영단어 · 생활 · 과제 */
export default function ParentGrowthScreen() {
  const { selected } = useParentChild();
  const { isTablet } = useResponsive();
  const [tab, setTab] = useState<GrowthSection>('exams');
  const sid = selected?.id ?? null;

  // 보이는 탭만 불러온다 (자녀·탭별 결과는 캐시돼 다시 오면 바로 보임)
  const path = (section: GrowthSection) => (sid && tab === section ? parentGrowthPath(section, sid) : null);
  const exams = useParentQuery<ParentExamsResponse>(path('exams'));
  const vocab = useParentQuery<ParentVocabResponse>(path('vocab'));
  const merits = useParentQuery<ParentMeritsResponse>(path('merits'));
  const tasks = useParentQuery<ParentTasksResponse>(path('tasks'));
  const active = { exams, vocab, merits, tasks }[tab];

  return (
    <Screen
      kind="tab"
      title="성장"
      right={<ChildSwitcher />}
      refreshing={active.isRefreshing}
      onRefresh={sid ? () => void active.refresh() : undefined}
      maxWidth={isTablet ? 720 : undefined}>
      {!selected ? (
        <EmptyState
          icon={UserRound}
          title="연결된 자녀가 없어요"
          description="독서실에서 받은 초대 코드로 자녀를 연결해 주세요."
        />
      ) : (
        <Stack>
          <SegmentTabs tabs={TABS} value={tab} onChange={setTab} />
          {tab === 'exams' && <Panel q={exams}>{(d) => <GrowthExams data={d} />}</Panel>}
          {tab === 'vocab' && <Panel q={vocab}>{(d) => <GrowthVocab data={d} />}</Panel>}
          {tab === 'merits' && <Panel q={merits}>{(d) => <GrowthLife data={d} />}</Panel>}
          {tab === 'tasks' && <Panel q={tasks}>{(d) => <GrowthTasks data={d} />}</Panel>}
        </Stack>
      )}
    </Screen>
  );
}
