import type { Href } from 'expo-router';
import { ClipboardCheck, Search, Users } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { TwoPane } from '@/components/two-pane';
import {
  Badge,
  color,
  EmptyState,
  ErrorState,
  ListRow,
  Notice,
  Screen,
  Section,
  SegmentTabs,
  space,
  Stack,
  Text,
  TextField,
  useMasterDetail,
} from '@/design';
import { formatWhen } from '@/features/staff-learning/format';
import { ListSkeleton } from '@/features/staff-learning/skeletons';
import { dueInfo, TASK_STATUS } from '@/features/staff-learning/status';
import { TaskReviewView } from '@/features/staff-learning/task-review';
import {
  STAFF_TASKS_PATH,
  type StaffTaskItem,
  type StaffTaskListResponse,
} from '@/lib/api/staff-learning';
import { useMobileQuery } from '@/lib/mobile-api';

type Filter = 'review' | 'revision' | 'active' | 'done';

const detailHref = (id: string) => `/(staff)/tasks/${id}` as Href;

const EMPTY: Record<Filter, { title: string; description: string }> = {
  review: { title: '검토할 제출물이 없어요', description: '학생이 과제를 내면 여기에 보여요.' },
  revision: { title: '수정 요청한 과제가 없어요', description: '수정을 요청한 과제는 학생이 다시 낼 때까지 여기 있어요.' },
  active: { title: '진행 중인 과제가 없어요', description: '새 수행평가는 웹 수행평가 화면에서 등록할 수 있어요.' },
  done: { title: '최근 완료한 과제가 없어요', description: '최근 45일 안에 완료한 과제가 여기에 보여요.' },
};

function inFilter(item: StaffTaskItem, filter: Filter) {
  switch (filter) {
    case 'review':
      return item.status === 'SUBMITTED';
    case 'revision':
      return item.status === 'NEEDS_REVISION';
    case 'active':
      return item.status === 'OPEN' || item.status === 'IN_PROGRESS';
    case 'done':
      return item.status === 'DONE';
  }
}

function sortFor(filter: Filter) {
  return (a: StaffTaskItem, b: StaffTaskItem) => {
    if (filter === 'review') {
      // 오래 기다린 제출물부터
      return (a.latestSubmission?.submittedAt ?? '').localeCompare(b.latestSubmission?.submittedAt ?? '');
    }
    if (filter === 'active') return a.dueDate.localeCompare(b.dueDate);
    return b.updatedAt.localeCompare(a.updatedAt);
  };
}

/** 수행평가 관리 — 제출물 검토·피드백. 원장은 전체, 그 외 직원은 담당 학생만 */
export default function StaffTasksScreen() {
  const [filter, setFilter] = useState<Filter>('review');
  const [query, setQuery] = useState('');
  const q = useMobileQuery<StaffTaskListResponse>(STAFF_TASKS_PATH);
  const md = useMasterDetail(detailHref);
  const data = q.data;

  const keyword = query.trim().toLowerCase();
  const matches = (item: StaffTaskItem) =>
    !keyword ||
    item.student.name.toLowerCase().includes(keyword) ||
    item.title.toLowerCase().includes(keyword) ||
    item.subject.toLowerCase().includes(keyword);

  const counts = data
    ? {
        review: data.items.filter((i) => inFilter(i, 'review')).length,
        revision: data.items.filter((i) => inFilter(i, 'revision')).length,
        active: data.items.filter((i) => inFilter(i, 'active')).length,
        done: data.items.filter((i) => inFilter(i, 'done')).length,
      }
    : null;
  const list = data ? data.items.filter((i) => inFilter(i, filter) && matches(i)).sort(sortFor(filter)) : [];

  const master = (
    <Screen
      kind="push"
      title="수행평가"
      backFallback="/(staff)/(tabs)"
      refreshing={q.isRefreshing}
      onRefresh={() => void q.refresh()}>
      <Stack>
        {data?.scope === 'assigned' ? (
          <Notice tone="gray" icon={Users}>
            담당 학생의 수행평가만 보여요.
          </Notice>
        ) : null}
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="학생 이름·과제 검색"
          returnKeyType="search"
          autoCorrect={false}
          prefix={
            <View style={{ justifyContent: 'center' }}>
              <Search color={color.fg.neutralSubtle} size={18} strokeWidth={2.2} />
            </View>
          }
          accessibilityLabel="학생 이름이나 과제로 검색"
        />
        <Section flush>
          <SegmentTabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: 'review', label: '검토 대기', count: counts?.review },
              { value: 'revision', label: '수정 요청', count: counts?.revision },
              { value: 'active', label: '진행 중', count: counts?.active },
              { value: 'done', label: '완료' },
            ]}
            style={{ marginHorizontal: space.x2 }}
          />
          {!data ? (
            q.error && !q.isLoading ? (
              <ErrorState message={q.error} onRetry={() => void q.retry()} />
            ) : (
              <ListSkeleton rows={5} title={false} />
            )
          ) : list.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title={keyword ? '검색 결과가 없어요' : EMPTY[filter].title}
              description={keyword ? '다른 이름이나 과제명으로 찾아보세요.' : EMPTY[filter].description}
              style={{ paddingVertical: space.x10 }}
            />
          ) : (
            <View style={{ paddingTop: space.x2 }}>
              {list.map((item) => (
                <TaskRow
                  key={item.id}
                  item={item}
                  filter={filter}
                  selected={md.selectedId === item.id}
                  onPress={() => md.open(item.id)}
                />
              ))}
            </View>
          )}
        </Section>
      </Stack>
    </Screen>
  );

  return (
    <TwoPane
      master={master}
      detail={
        md.selectedId ? (
          <TaskReviewView
            key={md.selectedId}
            taskId={md.selectedId}
            inline
            onClose={md.close}
            onChanged={() => void q.refresh()}
          />
        ) : null
      }
      detailVisible={!!md.selectedId}
      onCloseDetail={md.close}
      emptyTitle="과제를 골라 주세요"
      emptyMessage="왼쪽 목록에서 과제를 고르면 제출물과 피드백을 볼 수 있어요."
    />
  );
}

function TaskRow({
  item,
  filter,
  selected,
  onPress,
}: {
  item: StaffTaskItem;
  filter: Filter;
  selected: boolean;
  onPress: () => void;
}) {
  const st = TASK_STATUS[item.status];
  const isDone = item.status === 'DONE';
  const due = dueInfo(item.dueDate, isDone || item.status === 'SUBMITTED');
  const sub = item.latestSubmission;
  const detail =
    filter === 'review' && sub
      ? `v${sub.version} · ${formatWhen(sub.submittedAt)} 제출${sub.feedbackCount > 0 ? ` · 피드백 ${sub.feedbackCount}` : ''}`
      : sub
        ? `제출 ${item.submissionCount}회`
        : '아직 제출 전';
  return (
    <ListRow
      onPress={onPress}
      align="start"
      style={selected ? { backgroundColor: color.bg.neutralWeak } : undefined}
      meta={
        <>
          <Badge>{item.subject}</Badge>
          <Badge tone={st.tone}>{st.label}</Badge>
        </>
      }
      title={
        <Text variant="t5-medium" numberOfLines={2}>
          {item.title}
        </Text>
      }
      description={
        <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1}>
          {`${item.student.name} · ${item.student.grade} · ${detail}`}
        </Text>
      }
      trailing={isDone ? undefined : <Badge tone={due.tone}>{due.label}</Badge>}
    />
  );
}
