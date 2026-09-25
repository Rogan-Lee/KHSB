import { ClipboardCheck } from 'lucide-react-native';
import { View } from 'react-native';

import {
  Badge,
  EmptyState,
  ListRow,
  ProgressBar,
  Section,
  space,
  Stack,
  StatGrid,
  Text,
  type Tone,
} from '@/design';
import type { ParentTaskItem, ParentTasksResponse } from '@/lib/api/parent-reports';

import { dueLabel, formatDayKey } from './report-format';

// 학생 앱 수행평가와 같은 상태 문구·톤 (features/student-tasks/status.ts TASK_STATUS 와 동일 규칙)
const STATUS_TONE: Record<string, Tone> = {
  OPEN: 'gray',
  IN_PROGRESS: 'info',
  SUBMITTED: 'warn',
  NEEDS_REVISION: 'bad',
  DONE: 'ok',
};

/** 성장 · 과제 — 수행평가 진행 현황. 제출물·피드백 내용은 보여 주지 않는다 */
export function GrowthTasks({ data }: { data: ParentTasksResponse }) {
  const c = data.counts;
  if (c.total === 0) {
    return (
      <Section>
        <EmptyState
          icon={ClipboardCheck}
          title="등록된 수행평가가 없어요"
          description={
            data.isOnlineManaged
              ? '담당 선생님이 수행평가를 등록하면\n진행 상황을 여기서 볼 수 있어요.'
              : '수행평가 관리는 온라인 관리 과정에서\n함께 챙겨 드려요.'
          }
        />
      </Section>
    );
  }

  const doneRatio = c.total > 0 ? c.done / c.total : 0;

  return (
    <Stack>
      <Section title="진행 현황">
        <View style={{ gap: space.x2, marginBottom: space.x4 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: space.x2,
            }}>
            <Text variant="t4-regular" color="neutralSubtle">
              {`전체 ${c.total}개 중`}
            </Text>
            <Text variant="t5-bold" tabular>
              {`${c.done}개 완료`}
            </Text>
          </View>
          <ProgressBar value={doneRatio} tone="ok" />
        </View>
        <StatGrid
          items={[
            { label: '진행 중', value: c.open + c.inProgress },
            { label: '제출 완료', value: c.submitted },
            {
              label: '수정 필요',
              value: c.needsRevision,
              tone: c.needsRevision > 0 ? 'critical' : 'neutral',
            },
            { label: '완료', value: c.done, tone: c.done > 0 ? 'positive' : 'neutral' },
          ]}
        />
      </Section>

      {data.overdue.length > 0 && (
        <Section title="마감이 지났어요" description="아직 제출하지 않은 수행평가예요" flush>
          {data.overdue.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </Section>
      )}

      <Section title="다가오는 마감" flush>
        {data.upcoming.length > 0 ? (
          data.upcoming.map((t) => <TaskRow key={t.id} task={t} />)
        ) : (
          <Text
            variant="t4-regular"
            color="neutralSubtle"
            style={{ paddingHorizontal: space.x5, paddingBottom: space.x3 }}>
            남은 마감이 없어요.
          </Text>
        )}
      </Section>

      {data.recentDone.length > 0 && (
        <Section title="최근 완료" flush>
          {data.recentDone.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </Section>
      )}
    </Stack>
  );
}

function TaskRow({ task: t }: { task: ParentTaskItem }) {
  const settled = t.status === 'DONE' || t.status === 'SUBMITTED';
  const due = dueLabel(t.dueDate, settled);
  return (
    <ListRow
      meta={
        <>
          <Badge tone="gray">{t.subject}</Badge>
          <Badge tone={STATUS_TONE[t.status] ?? 'gray'}>{t.statusLabel}</Badge>
        </>
      }
      title={
        <Text variant="t5-medium" numberOfLines={2}>
          {t.title}
        </Text>
      }
      description={
        <Text variant="t4-regular" color="neutralSubtle" tabular numberOfLines={1}>
          {t.score ? `${formatDayKey(t.dueDate)} 마감 · 결과 ${t.score}` : `${formatDayKey(t.dueDate)} 마감`}
        </Text>
      }
      trailing={
        t.status === 'DONE' ? undefined : (
          <Badge tone={due.tone} solid={due.tone === 'brand'} size="md">
            {due.label}
          </Badge>
        )
      }
    />
  );
}
