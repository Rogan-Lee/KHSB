import { useFocusEffect } from 'expo-router';
import { Clock, LayoutGrid, MessageSquareText, Search, SearchX, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  Chip,
  color,
  EmptyState,
  ErrorState,
  GroupLabel,
  HeaderIconButton,
  Notice,
  Press,
  radius,
  Screen,
  Section,
  Skeleton,
  space,
  Stack,
  StatGrid,
  Text,
  TextField,
} from '@/design';
import { TwoPane } from '@/components/two-pane';
import { OfflineOpsLocked, useOfflineOpsAllowed } from '@/features/staff-ops/access';
import { StudentQuickSheet } from '@/features/staff-ops/student-quick-sheet';
import { StudentProfilePanel } from '@/features/staff-ops/student-profile';
import { StudentRow } from '@/features/staff-ops/student-row';
import { matchesStudent } from '@/features/staff-ops/status';
import type { OpsAttendanceItem, OpsAttendanceResponse } from '@/lib/api/staff-ops';
import { formatKoreanDay } from '@/lib/format';
import { useMobileQuery } from '@/lib/mobile-api';
import { useResponsive } from '@/lib/responsive';

type Filter = 'all' | 'in' | 'out' | 'waiting' | 'late' | 'absent' | 'left' | 'attention' | 'request';

const FILTER_TEST: Record<Filter, (i: OpsAttendanceItem) => boolean> = {
  all: () => true,
  in: (i) => i.status === '입실',
  out: (i) => i.status === '외출',
  waiting: (i) => i.status === '미입실',
  late: (i) => i.isLate,
  absent: (i) => i.status === '결석',
  left: (i) => i.status === '퇴실',
  attention: (i) => !!i.attention,
  request: (i) => i.unreadRequests > 0,
};

const FILTER_LABEL: Record<Filter, string> = {
  all: '전체',
  in: '재실',
  out: '외출',
  waiting: '미입실',
  late: '지각',
  absent: '결석',
  left: '퇴실',
  attention: '유의',
  request: '학부모 요청',
};

// 0명이면 숨기는 보조 필터
const OPTIONAL_FILTERS: Filter[] = ['late', 'absent', 'attention', 'request'];

export default function StaffAttendanceTab() {
  const allowed = useOfflineOpsAllowed();
  if (!allowed) return <OfflineOpsLocked title="입퇴실" kind="tab" />;
  return <AttendanceBoard />;
}

function AttendanceBoard() {
  const { isTablet } = useResponsive();
  const { data, error, isLoading, isRefreshing, refresh, retry } = useMobileQuery<OpsAttendanceResponse>(
    '/api/mobile/v1/staff/attendance'
  );
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sheet, setSheet] = useState<{ id: string; open: boolean } | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);

  // 현장에선 키오스크·다른 직원이 계속 바꾸므로 보고 있는 동안 1분마다 조용히 갱신
  useFocusEffect(
    useCallback(() => {
      const t = setInterval(() => void retry(), 60_000);
      return () => clearInterval(t);
    }, [retry])
  );

  const reload = useCallback(() => void retry(), [retry]);
  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const counts = useMemo(() => {
    const c = {} as Record<Filter, number>;
    (Object.keys(FILTER_TEST) as Filter[]).forEach((f) => {
      c[f] = items.filter(FILTER_TEST[f]).length;
    });
    return c;
  }, [items]);

  const visible = useMemo(
    () => items.filter((i) => FILTER_TEST[filter](i) && matchesStudent(i, query)),
    [items, filter, query]
  );

  const openStudent = useCallback(
    (item: OpsAttendanceItem) => {
      if (isTablet) setPanelId(item.id);
      else setSheet({ id: item.id, open: true });
    },
    [isTablet]
  );

  const sheetItem = sheet ? (items.find((i) => i.id === sheet.id) ?? null) : null;
  const summary = data?.summary;
  const filtering = filter !== 'all' || query.trim() !== '';

  const master = (
    <Screen
      kind="tab"
      title="입퇴실"
      maxWidth={isTablet ? 0 : undefined}
      refreshing={isRefreshing}
      onRefresh={() => void refresh()}
      right={
        <>
          <HeaderIconButton icon={LayoutGrid} label="좌석 현황" href="/(staff)/seat-map" />
          <HeaderIconButton icon={Search} label="학생 찾기" href="/(staff)/students" />
        </>
      }>
      {isLoading && !data ? (
        <AttendanceSkeleton />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : (
        <Stack>
          <Text variant="t4-regular" color="neutralSubtle" style={{ paddingHorizontal: space.x1 }}>
            {`${formatKoreanDay()} · 자습실 학생 ${summary?.total ?? 0}명`}
          </Text>

          {summary && (
            <Section>
              <StatGrid
                surface="plain"
                items={[
                  { label: '재실', value: summary.inRoom, tone: 'positive' },
                  { label: '외출', value: summary.away, tone: summary.away ? 'warning' : 'neutral' },
                  {
                    label: '미입실',
                    value: summary.notArrived,
                    sub: summary.late ? `지각 ${summary.late}` : undefined,
                    tone: summary.late ? 'critical' : 'neutral',
                  },
                  { label: '퇴실', value: summary.checkedOut },
                ]}
              />
            </Section>
          )}

          {summary && summary.late > 0 && filter !== 'late' && (
            <Notice tone="bad" icon={Clock} onPress={() => setFilter('late')}>
              {`예정 시각보다 30분 넘게 안 온 학생이 ${summary.late}명 있어요`}
            </Notice>
          )}
          {counts.request > 0 && filter !== 'request' && (
            <Notice tone="gray" icon={MessageSquareText} onPress={() => setFilter('request')}>
              {`확인 안 한 학부모 요청이 ${summary?.unreadRequests ?? counts.request}건 있어요`}
            </Notice>
          )}

          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder="이름·좌석·학교로 찾기"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="학생 검색"
            prefix={
              <View style={s.searchIcon}>
                <Search color={color.fg.neutralSubtle} size={20} strokeWidth={2.2} />
              </View>
            }
            suffix={
              query ? (
                <Press
                  onPress={() => setQuery('')}
                  scale={0}
                  hitSlop={8}
                  accessibilityLabel="검색어 지우기"
                  style={s.clear}>
                  <X color={color.fg.neutralInverted} size={12} strokeWidth={3} />
                </Press>
              ) : undefined
            }
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.chipScroll}
            contentContainerStyle={s.chipRow}>
            {(Object.keys(FILTER_TEST) as Filter[])
              .filter((f) => !OPTIONAL_FILTERS.includes(f) || counts[f] > 0 || filter === f)
              .map((f) => (
                <Chip key={f} selected={filter === f} onPress={() => setFilter(f)}>
                  {`${FILTER_LABEL[f]} ${counts[f]}`}
                </Chip>
              ))}
          </ScrollView>

          <View>
            <GroupLabel trailing={filtering ? `${visible.length}명` : undefined}>
              {filtering ? '찾은 학생' : '좌석순'}
            </GroupLabel>
            {visible.length === 0 ? (
              <Section>
                <EmptyState
                  icon={SearchX}
                  title="조건에 맞는 학생이 없어요"
                  description={filtering ? '검색어나 필터를 바꿔 보세요.' : '오늘 자습실 학생이 없어요.'}
                  action={
                    filtering ? (
                      <Button
                        variant="weak"
                        size="sm"
                        onPress={() => {
                          setFilter('all');
                          setQuery('');
                        }}>
                        전체 보기
                      </Button>
                    ) : undefined
                  }
                />
              </Section>
            ) : (
              <Section flush>
                {visible.map((item) => (
                  <StudentRow
                    key={item.id}
                    item={item}
                    onPress={openStudent}
                    quickAction
                    onChanged={reload}
                    selected={isTablet && panelId === item.id}
                  />
                ))}
              </Section>
            )}
          </View>
        </Stack>
      )}
    </Screen>
  );

  return (
    <>
      <TwoPane
        master={master}
        masterWidth={420}
        detail={
          panelId ? (
            <StudentProfilePanel
              key={panelId}
              id={panelId}
              onClose={() => setPanelId(null)}
              onChanged={reload}
            />
          ) : null
        }
        detailVisible={!!panelId}
        onCloseDetail={() => setPanelId(null)}
        emptyTitle="학생을 고르세요"
        emptyMessage="왼쪽 목록에서 학생을 누르면 오늘 출결과 프로필을 여기서 관리할 수 있어요."
      />
      {!isTablet && (
        <StudentQuickSheet
          item={sheetItem}
          open={!!sheet?.open}
          onClose={() => setSheet((cur) => (cur ? { ...cur, open: false } : cur))}
          onChanged={reload}
        />
      )}
    </>
  );
}

function AttendanceSkeleton() {
  return (
    <Stack>
      <Skeleton style={{ width: 180, height: 16, marginLeft: space.x1 }} />
      <View style={s.skelCard}>
        <View style={{ flexDirection: 'row', gap: space.x3 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: space.x1_5 }}>
              <Skeleton style={{ width: 32, height: 14 }} />
              <Skeleton style={{ width: 28, height: 22 }} />
            </View>
          ))}
        </View>
      </View>
      <Skeleton style={{ height: 52, borderRadius: radius.r3 }} />
      <View style={{ flexDirection: 'row', gap: space.x2 }}>
        {[64, 56, 72, 56].map((w, i) => (
          <Skeleton key={i} style={{ width: w, height: 36, borderRadius: radius.full }} />
        ))}
      </View>
      <View style={s.skelCard}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3, paddingVertical: space.x2 }}>
            <Skeleton style={{ width: 44, height: 44, borderRadius: radius.r3 }} />
            <View style={{ flex: 1, gap: space.x1_5 }}>
              <Skeleton style={{ width: '40%', height: 16 }} />
              <Skeleton style={{ width: '65%', height: 14 }} />
            </View>
            <Skeleton style={{ width: 44, height: 24, borderRadius: radius.r1_5 }} />
          </View>
        ))}
      </View>
    </Stack>
  );
}

const s = StyleSheet.create({
  searchIcon: { justifyContent: 'center' },
  clear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.palette.gray600,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  chipScroll: { marginHorizontal: -space.x4 },
  chipRow: { gap: space.x2, paddingHorizontal: space.x4 },
  skelCard: { backgroundColor: color.bg.layerDefault, borderRadius: radius.r5, padding: space.x5 },
});
