import { Search, SearchX, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Avatar,
  color,
  EmptyState,
  ErrorState,
  GroupLabel,
  Press,
  radius,
  Screen,
  Section,
  SectionAction,
  Skeleton,
  space,
  Stack,
  Text,
  TextField,
  useMasterDetail,
} from '@/design';
import { TwoPane } from '@/components/two-pane';
import {
  clearRecentStudents,
  rememberStudent,
  useRecentStudents,
  type RecentStudent,
} from '@/features/staff-ops/recent-students';
import { OfflineOpsLocked, useOfflineOpsAllowed } from '@/features/staff-ops/access';
import { staffOpsRoutes } from '@/features/staff-ops/routes';
import { matchesStudent } from '@/features/staff-ops/status';
import { StudentProfilePanel } from '@/features/staff-ops/student-profile';
import { StudentRow } from '@/features/staff-ops/student-row';
import type { OpsAttendanceItem, OpsStudentsResponse } from '@/lib/api/staff-ops';
import { useMobileQuery } from '@/lib/mobile-api';

/** 학생 찾기 — 이름·좌석·학교·학년. 전체 목록을 한 번 받아 입력하는 즉시 거른다. */
export default function StaffStudentSearchScreen() {
  const allowed = useOfflineOpsAllowed();
  if (!allowed) return <OfflineOpsLocked title="학생 찾기" />;
  return <StudentSearch />;
}

function StudentSearch() {
  const { data, error, isLoading, isRefreshing, refresh, retry } = useMobileQuery<OpsStudentsResponse>(
    '/api/mobile/v1/staff/students'
  );
  const [query, setQuery] = useState('');
  const recent = useRecentStudents();
  const md = useMasterDetail(useCallback((id: string) => staffOpsRoutes.student(id), []));

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const results = useMemo(() => items.filter((s) => matchesStudent(s, query)), [items, query]);
  const searching = query.trim() !== '';

  const open = (s: Pick<OpsAttendanceItem, 'id' | 'name' | 'grade' | 'seat'>) => {
    void rememberStudent({ id: s.id, name: s.name, grade: s.grade, seat: s.seat });
    md.open(s.id);
  };

  const master = (
    <Screen
      kind="push"
      title="학생 찾기"
      backFallback="/(staff)/(tabs)"
      maxWidth={md.isTablet ? 0 : undefined}
      refreshing={isRefreshing}
      onRefresh={() => void refresh()}>
      <Stack>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="이름, 좌석 번호, 학교"
          autoFocus={!md.isTablet}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="학생 검색"
          prefix={
            <View style={{ justifyContent: 'center' }}>
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

        {!searching && recent.length > 0 && (
          <Section
            title="최근 본 학생"
            action={<SectionAction onPress={() => void clearRecentStudents()}>지우기</SectionAction>}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recentRow}>
              {recent.map((r) => (
                <RecentChip key={r.id} student={r} onPress={() => open(r)} />
              ))}
            </ScrollView>
          </Section>
        )}

        {isLoading && !data ? (
          <ListSkeleton />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={() => void retry()} />
        ) : (
          <View>
            <GroupLabel trailing={`${results.length}명`}>
              {searching ? '검색 결과' : '전체 학생 · 좌석순'}
            </GroupLabel>
            {results.length === 0 ? (
              <Section>
                <EmptyState
                  icon={SearchX}
                  title={searching ? `'${query.trim()}'에 맞는 학생이 없어요` : '자습실 학생이 없어요'}
                  description={searching ? '이름 일부나 좌석 번호로도 찾을 수 있어요.' : undefined}
                />
              </Section>
            ) : (
              <Section flush>
                {results.map((item) => (
                  <StudentRow key={item.id} item={item} onPress={open} selected={md.selectedId === item.id} />
                ))}
              </Section>
            )}
          </View>
        )}
      </Stack>
    </Screen>
  );

  return (
    <TwoPane
      master={master}
      masterWidth={420}
      detail={
        md.selectedId ? (
          <StudentProfilePanel key={md.selectedId} id={md.selectedId} onClose={md.close} />
        ) : null
      }
      detailVisible={!!md.selectedId}
      onCloseDetail={md.close}
      emptyTitle="학생을 고르세요"
      emptyMessage="왼쪽에서 학생을 누르면 프로필이 여기에 열려요."
    />
  );
}

function RecentChip({ student, onPress }: { student: RecentStudent; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      scale={0.96}
      pressedBg
      accessibilityLabel={`${student.name} 프로필`}
      style={s.recentItem}>
      <Avatar name={student.name} size={44} />
      <Text variant="t3-medium" numberOfLines={1}>
        {student.name}
      </Text>
      <Text variant="t2-regular" color="neutralSubtle" numberOfLines={1}>
        {student.seat ? `${student.seat}번` : student.grade}
      </Text>
    </Press>
  );
}

function ListSkeleton() {
  return (
    <View style={s.skelCard}>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <View
          key={i}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3, paddingVertical: space.x2 }}>
          <Skeleton style={{ width: 44, height: 44, borderRadius: radius.r3 }} />
          <View style={{ flex: 1, gap: space.x1_5 }}>
            <Skeleton style={{ width: '35%', height: 16 }} />
            <Skeleton style={{ width: '60%', height: 14 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  clear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.palette.gray600,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  recentRow: { gap: space.x2 },
  recentItem: {
    width: 64,
    alignItems: 'center',
    gap: space.x1,
    paddingVertical: space.x1,
    borderRadius: radius.r3,
  },
  skelCard: { backgroundColor: color.bg.layerDefault, borderRadius: radius.r5, padding: space.x5 },
});
