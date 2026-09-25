import type { Href } from 'expo-router';
import { CalendarCheck, Send } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { TwoPane } from '@/components/two-pane';
import {
  Badge,
  Chip,
  ChipGroup,
  color,
  EmptyState,
  ErrorState,
  HeaderIconButton,
  ListRow,
  Screen,
  Section,
  Segmented,
  space,
  Stack,
  StatGrid,
  Text,
  useMasterDetail,
} from '@/design';
import { MentoringDetailView } from '@/features/staff-learning/mentoring-detail';
import { ListSkeleton, StatSkeleton } from '@/features/staff-learning/skeletons';
import {
  formatDateKeyCompact,
  formatDateKeyLong,
  formatDateKeyShort,
} from '@/features/staff-learning/format';
import { MENTORING_STATE } from '@/features/staff-learning/status';
import {
  mentoringSchedulePath,
  type MentoringRange,
  type MentoringScheduleResponse,
  type MentoringSessionItem,
} from '@/lib/api/staff-learning';
import { isStaffCapabilities } from '@/lib/capabilities';
import { useMobileQuery } from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

const detailHref = (id: string) => `/(staff)/mentoring/${id}` as Href;

const RANGE_OPTIONS: { value: MentoringRange; label: string }[] = [
  { value: 'today', label: '오늘' },
  { value: 'week', label: '이번 주' },
];

/** 직원 멘토링 탭 — 자습실 운영진(offlineOps)만. 온라인 전용 역할에는 안내만 보여 준다 */
export default function StaffMentoringTab() {
  const { session } = useSession();
  const caps = isStaffCapabilities(session?.capabilities) ? session.capabilities : null;
  if (caps && !caps.offlineOps) {
    return (
      <Screen kind="tab" title="멘토링">
        <Section>
          <EmptyState
            icon={CalendarCheck}
            title="자습실 멘토링은 운영진 메뉴예요"
            description="온라인 관리 학생의 수행평가는 전체 탭의 수행평가에서 볼 수 있어요."
            style={{ paddingVertical: space.x10 }}
          />
        </Section>
      </Screen>
    );
  }
  return <MentoringSchedule />;
}

/** 오늘/이번 주 일정, 기록 필요 표시, 탭하면 상세·기록 (태블릿은 오른쪽 패널) */
function MentoringSchedule() {
  const [range, setRange] = useState<MentoringRange>('today');
  const [mineOnly, setMineOnly] = useState(false);
  const q = useMobileQuery<MentoringScheduleResponse>(mentoringSchedulePath(range));
  // 범위를 바꾸면 새 응답이 올 때까지 이전 범위 데이터를 보이지 않는다
  const data = q.data?.range === range ? q.data : null;
  const md = useMasterDetail(detailHref);

  const pick = (list: MentoringSessionItem[]) => (mineOnly ? list.filter((i) => i.isMine) : list);
  const items = data ? pick(data.items) : [];
  const backlog = data ? pick(data.backlog) : [];
  const showMineChip = !!data && data.scope === 'all' && [...data.items, ...data.backlog].some((i) => i.isMine);

  const summary = {
    total: items.length,
    scheduled: items.filter((i) => i.state === 'SCHEDULED').length,
    needsRecord: items.filter((i) => i.state === 'NEEDS_RECORD').length,
    completed: items.filter((i) => i.state === 'COMPLETED').length,
  };

  const renderRow = (item: MentoringSessionItem, showDate = false) => (
    <SessionRow
      key={item.id}
      item={item}
      showDate={showDate}
      showMentor={!item.isMine && data?.scope === 'all'}
      selected={md.selectedId === item.id}
      onPress={() => md.open(item.id)}
    />
  );

  let body: ReactNode;
  if (!data) {
    body =
      q.error && !q.isLoading && !q.data ? (
        <ErrorState message={q.error} onRetry={() => void q.retry()} />
      ) : (
        <>
          <StatSkeleton cells={4} />
          <ListSkeleton rows={4} />
        </>
      );
  } else {
    const days = groupByDay(items);
    body = (
      <>
        <Section>
          <StatGrid
            surface="plain"
            items={[
              { label: '전체', value: summary.total },
              { label: '예정', value: summary.scheduled, tone: 'informative' },
              {
                label: '기록 필요',
                value: summary.needsRecord,
                tone: summary.needsRecord > 0 ? 'critical' : 'neutral',
              },
              { label: '완료', value: summary.completed, tone: 'positive' },
            ]}
          />
        </Section>

        {backlog.length > 0 ? (
          <Section
            flush
            title="밀린 기록"
            description={`지난 2주 동안 기록하지 않은 멘토링 ${backlog.length}건이에요`}>
            {backlog.map((item) => renderRow(item, true))}
          </Section>
        ) : null}

        {items.length === 0 ? (
          <Section>
            <EmptyState
              icon={CalendarCheck}
              title={range === 'today' ? '오늘 잡힌 멘토링이 없어요' : '이번 주 잡힌 멘토링이 없어요'}
              description="새 멘토링 일정은 웹 멘토링 화면에서 등록할 수 있어요."
              style={{ paddingVertical: space.x8 }}
            />
          </Section>
        ) : range === 'today' ? (
          <Section flush title="오늘 일정" description={formatDateKeyLong(data.today)}>
            {items.map((item) => renderRow(item))}
          </Section>
        ) : (
          days.map(([dateKey, list]) => (
            <Section
              key={dateKey}
              flush
              title={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
                  <Text variant="t6-bold">{formatDateKeyShort(dateKey)}</Text>
                  {dateKey === data.today ? <Badge tone="brand">오늘</Badge> : null}
                </View>
              }
              action={
                <Text variant="t4-regular" color="neutralSubtle" tabular>
                  {`${list.length}건`}
                </Text>
              }>
              {list.map((item) => renderRow(item))}
            </Section>
          ))
        )}
      </>
    );
  }

  const master = (
    <Screen
      kind="tab"
      title="멘토링"
      refreshing={q.isRefreshing}
      onRefresh={() => void q.refresh()}
      right={<HeaderIconButton icon={Send} label="학부모 리포트 발송 현황" href="/(staff)/parent-reports" />}>
      <Stack>
        <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
        {showMineChip ? (
          <ChipGroup>
            <Chip size="sm" selected={mineOnly} onPress={() => setMineOnly((v) => !v)}>
              내 멘토링만
            </Chip>
          </ChipGroup>
        ) : null}
        {body}
      </Stack>
    </Screen>
  );

  return (
    <TwoPane
      master={master}
      detail={
        md.selectedId ? (
          <MentoringDetailView
            key={md.selectedId}
            id={md.selectedId}
            inline
            onClose={md.close}
            onChanged={() => void q.refresh()}
          />
        ) : null
      }
      detailVisible={!!md.selectedId}
      onCloseDetail={md.close}
      emptyTitle="멘토링을 골라 주세요"
      emptyMessage="왼쪽 일정에서 멘토링을 고르면 여기서 기록을 쓸 수 있어요."
    />
  );
}

function groupByDay(items: MentoringSessionItem[]) {
  const map = new Map<string, MentoringSessionItem[]>();
  for (const item of items) {
    const list = map.get(item.dateKey) ?? [];
    list.push(item);
    map.set(item.dateKey, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function SessionRow({
  item,
  showDate,
  showMentor,
  selected,
  onPress,
}: {
  item: MentoringSessionItem;
  showDate: boolean;
  showMentor: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const st = MENTORING_STATE[item.state];
  const details = [
    item.grade,
    item.seat ? `${item.seat}번` : null,
    showMentor ? `${item.mentorName} 멘토` : null,
    item.state === 'COMPLETED' && !item.hasParentReport ? '리포트 미발송' : null,
  ].filter(Boolean);
  return (
    <ListRow
      onPress={onPress}
      style={selected ? { backgroundColor: color.bg.neutralWeak } : undefined}
      leading={
        <View style={{ minWidth: 52, alignItems: 'flex-start' }}>
          {showDate ? (
            <Text variant="t3-medium" color="neutralSubtle" numberOfLines={1}>
              {formatDateKeyCompact(item.dateKey)}
            </Text>
          ) : null}
          <Text
            variant={item.timeLabel ? 't5-bold' : 't3-medium'}
            color={item.timeLabel ? 'neutral' : 'neutralSubtle'}
            tabular
            numberOfLines={1}>
            {item.timeLabel ?? '시간 미정'}
          </Text>
        </View>
      }
      title={
        <Text variant="t5-medium" numberOfLines={1}>
          {item.studentName}
        </Text>
      }
      description={
        details.length > 0 ? (
          <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1}>
            {details.join(' · ')}
          </Text>
        ) : undefined
      }
      trailing={<Badge tone={st.tone}>{st.label}</Badge>}
      chevron={false}
    />
  );
}
