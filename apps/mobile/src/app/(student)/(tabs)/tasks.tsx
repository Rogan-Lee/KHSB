import { router, useLocalSearchParams, type Href } from 'expo-router';
import { CheckCircle2, CircleAlert, ClipboardList } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  color,
  EmptyState,
  ErrorState,
  ListRow,
  Notice,
  ProgressBar,
  Screen,
  Section,
  SegmentTabs,
  Skeleton,
  space,
  Text,
  useMasterDetail,
  useResponsive,
} from '@/design';
import { TwoPane } from '@/components/two-pane';
import { dueInfo, formatMonthDay, isSettled, TASK_STATUS } from '@/features/student-tasks/status';
import { TaskDetail } from '@/features/student-tasks/task-detail';
import {
  STUDENT_TASKS_PATH,
  type MobileTaskSummary,
  type StudentTasksResponse,
} from '@/lib/api/student-learning';
import { useMobileQuery } from '@/lib/mobile-api';
import { syncTaskDeadlineNotifications } from '@/lib/notifications';

type TabKey = 'open' | 'done';

const taskRoute = (id: string) => `/(student)/tasks/${id}` as Href;

/**
 * 수행평가 탭 — 웹 포털 /s/[token]/tasks 와 같은 구성.
 *  요약 카드(가장 급한 한 줄 + 완료 진행률) → 진행중/완료 탭 → 과제 목록(상태 배지 · 마감일 · D-day).
 * 태블릿은 목록 + 상세를 나란히(TwoPane), 폰은 상세 화면으로 이동.
 */
export default function StudentTasksTab() {
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StudentTasksResponse>(STUDENT_TASKS_PATH);
  const md = useMasterDetail(taskRoute);
  const { open: openTask } = md;
  const { width } = useResponsive();
  const [tab, setTab] = useState<TabKey>('open');

  // 기기 로컬 마감 알림(전날 18시·당일 8시) 동기화
  useEffect(() => {
    if (data) void syncTaskDeadlineNotifications(data.items).catch(() => undefined);
  }, [data]);

  // 알림·피드백 화면에서 ?taskId= 로 들어오면 해당 과제를 바로 연다
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  useEffect(() => {
    if (!taskId) return;
    openTask(taskId);
    router.setParams({ taskId: '' });
  }, [taskId, openTask]);

  const list = (
    <Screen
      kind="tab"
      title="수행평가"
      refreshing={isRefreshing}
      onRefresh={() => void refresh()}>
      {data ? (
        <TaskList
          data={data}
          tab={tab}
          onTab={setTab}
          selectedId={md.selectedId}
          onOpen={openTask}
        />
      ) : isLoading || !error ? (
        <ListSkeleton />
      ) : (
        <ErrorState message={error} onRetry={() => void retry()} />
      )}
    </Screen>
  );

  return (
    <TwoPane
      master={list}
      // iPad mini 세로(744)에서도 상세(제출 폼)가 넉넉하도록 목록은 폭의 40% · 320~420
      masterWidth={Math.round(Math.min(420, Math.max(320, width * 0.4)))}
      detail={
        md.selectedId ? (
          <TaskDetail
            key={md.selectedId}
            taskId={md.selectedId}
            inline
            onClose={md.close}
            onChanged={() => void refresh()}
          />
        ) : null
      }
      detailVisible={!!md.selectedId}
      onCloseDetail={md.close}
      emptyTitle="과제를 골라 주세요"
      emptyMessage="왼쪽 목록에서 과제를 누르면 여기에서 바로 보고 제출할 수 있어요."
    />
  );
}

function TaskList({
  data,
  tab,
  onTab,
  selectedId,
  onOpen,
}: {
  data: StudentTasksResponse;
  tab: TabKey;
  onTab: (t: TabKey) => void;
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  const tasks = data.items;
  const upcoming = tasks.filter((t) => t.status !== 'DONE');
  const done = tasks.filter((t) => t.status === 'DONE');
  const list = tab === 'done' ? done : upcoming;

  // 요약 카드 문구 — 가장 급한 것 하나만 (웹과 같은 우선순위)
  const todo = upcoming.filter((t) => !isSettled(t.status));
  const revisions = todo.filter((t) => t.status === 'NEEDS_REVISION');
  const overdue = todo.filter((t) => dueInfo(t.dueDate).days < 0).length;
  const dueSoon = todo.filter((t) => {
    const { days } = dueInfo(t.dueDate);
    return days >= 0 && days <= 3;
  }).length;
  const headline =
    revisions.length > 0
      ? `수정할 과제가 ${revisions.length}건 있어요`
      : overdue > 0
        ? `마감이 지난 과제가 ${overdue}건 있어요`
        : dueSoon > 0
          ? `3일 안에 마감되는 과제가 ${dueSoon}건 있어요`
          : upcoming.length > 0
            ? `진행 중인 과제가 ${upcoming.length}건 있어요`
            : '모든 과제를 끝냈어요';

  return (
    <View>
      {tasks.length > 0 && (
        <Section style={{ marginBottom: space.x2 }}>
          <Text variant="t6-bold">{headline}</Text>
          <View style={s.progressRow}>
            <View style={{ flex: 1 }}>
              <ProgressBar value={done.length / tasks.length} tone="ok" />
            </View>
            <Text variant="t3-medium" color="neutralMuted" tabular>
              {done.length}/{tasks.length} 완료
            </Text>
          </View>
        </Section>
      )}

      {revisions[0] && (
        <Notice
          tone="bad"
          icon={CircleAlert}
          title="수정 요청"
          onPress={() => onOpen(revisions[0].id)}
          style={{ marginBottom: space.x2 }}>
          {revisions[0].title} — 피드백을 확인하고 다시 제출해 주세요.
        </Notice>
      )}

      <SegmentTabs<TabKey>
        tabs={[
          { value: 'open', label: '진행중', count: upcoming.length },
          { value: 'done', label: '완료', count: done.length },
        ]}
        value={tab}
        onChange={onTab}
        style={s.tabs}
      />

      {list.length === 0 ? (
        <Section>
          {tab === 'done' ? (
            <EmptyState
              icon={CheckCircle2}
              tone="ok"
              title="완료한 과제가 없어요"
              description="최종 승인을 받은 과제가 여기에 모여요."
              style={s.empty}
            />
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="진행 중인 과제가 없어요"
              description="새 수행평가가 등록되면 여기에서 알려드릴게요."
              style={s.empty}
            />
          )}
        </Section>
      ) : (
        <Section flush>
          {list.map((t) => (
            <TaskRow key={t.id} task={t} selected={t.id === selectedId} onPress={() => onOpen(t.id)} />
          ))}
        </Section>
      )}
    </View>
  );
}

function TaskRow({
  task,
  selected,
  onPress,
}: {
  task: MobileTaskSummary;
  selected: boolean;
  onPress: () => void;
}) {
  const status = TASK_STATUS[task.status] ?? TASK_STATUS.OPEN;
  const due = dueInfo(task.dueDate, isSettled(task.status));
  const isDone = task.status === 'DONE';
  return (
    <ListRow
      onPress={onPress}
      meta={isDone ? undefined : <Badge tone={status.tone}>{status.label}</Badge>}
      title={task.title}
      description={
        <Text variant="t4-regular" color="neutralSubtle" tabular>
          {task.subject} · {formatMonthDay(task.dueDate)} 마감
          {task.format ? ` · ${task.format}` : ''}
        </Text>
      }
      trailing={
        isDone ? undefined : (
          <Badge tone={due.tone} size="md" style={{ alignSelf: 'center' }}>
            {due.label}
          </Badge>
        )
      }
      style={selected ? { backgroundColor: color.bg.transparentSelected } : undefined}
    />
  );
}

function ListSkeleton() {
  return (
    <View>
      <Section style={{ marginBottom: space.x2 }}>
        <Skeleton style={{ width: '64%', height: 24 }} />
        <View style={s.progressRow}>
          <Skeleton style={{ flex: 1, height: 8, borderRadius: 4 }} />
          <Skeleton style={{ width: 52, height: 16 }} />
        </View>
      </Section>
      <View style={[s.tabs, s.skeletonTabs]}>
        <Skeleton style={{ width: 64, height: 20 }} />
        <Skeleton style={{ width: 48, height: 20 }} />
      </View>
      <Section flush>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={s.skeletonRow}>
            <View style={{ flex: 1, gap: space.x1_5 }}>
              <Skeleton style={{ width: 52, height: 20 }} />
              <Skeleton style={{ width: '78%', height: 20 }} />
              <Skeleton style={{ width: '56%', height: 16 }} />
            </View>
            <Skeleton style={{ width: 44, height: 24 }} />
          </View>
        ))}
      </Section>
    </View>
  );
}

const s = StyleSheet.create({
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space.x3, marginTop: space.x3_5 },
  // 웹처럼 화면 끝까지 닿는 밑줄 탭
  tabs: {
    marginHorizontal: -space.x4,
    marginBottom: space.x3,
    backgroundColor: color.bg.layerBasement,
  },
  empty: { paddingVertical: space.x8 },
  skeletonTabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 44,
    borderBottomWidth: 1,
    borderBottomColor: color.stroke.neutralSubtle,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    marginHorizontal: space.x2,
    paddingHorizontal: space.x3,
    paddingVertical: space.x3,
  },
});
