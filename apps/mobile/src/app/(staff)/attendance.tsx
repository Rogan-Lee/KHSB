import { Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  SectionTitle,
} from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';
import { StaffAttendanceResponse, useMobileQuery } from '@/lib/mobile-api';

const FILTERS = ['전체', '입실', '외출', '퇴실', '미입실', '결석'] as const;
type AttendanceFilter = (typeof FILTERS)[number];

export default function AttendanceScreen() {
  const [filter, setFilter] = useState<AttendanceFilter>('전체');
  const [query, setQuery] = useState('');
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StaffAttendanceResponse>('/api/mobile/v1/staff/attendance');

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (
      data?.items.filter(
        (student) =>
          (filter === '전체' || student.status === filter) &&
          (!normalized ||
            student.name.toLowerCase().includes(normalized) ||
            student.seat?.toLowerCase().includes(normalized)),
      ) ?? []
    );
  }, [data?.items, filter, query]);

  return (
    <AppScreen
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="오늘 학생 상태를 실시간으로 확인합니다."
      title="입퇴실 관리">
      <View style={styles.search}>
        <Search color={colors.muted} size={18} />
        <TextInput
          onChangeText={setQuery}
          placeholder="학생 이름 또는 좌석 검색"
          placeholderTextColor="#9AA49F"
          style={styles.searchInput}
          value={query}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.filters}
        horizontal
        showsHorizontalScrollIndicator={false}>
        {FILTERS.map((item) => (
          <Pressable
            key={item}
            onPress={() => setFilter(item)}
            style={[styles.filter, filter === item && styles.filterActive]}>
            <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>
              {item}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <SectionTitle action={<Text style={styles.count}>{visible.length}명</Text>}>
        학생 현황
      </SectionTitle>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data && visible.length === 0 ? (
        <EmptyState message="검색어나 상태 필터를 변경해 보세요." />
      ) : null}
      {visible.length > 0 ? (
        <Card>
          {visible.map((student, index) => (
            <View key={student.id}>
              <View style={styles.student}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{student.name.slice(0, 1)}</Text>
                </View>
                <View style={styles.studentText}>
                  <View style={styles.nameRow}>
                    <Text style={styles.studentName}>{student.name}</Text>
                    {student.isLate ? <Badge tone="red">확인 필요</Badge> : null}
                  </View>
                  <Text style={styles.studentMeta}>
                    {student.grade}
                    {student.seat ? ` · ${student.seat}번` : ''}
                    {' · '}
                    {student.time ?? student.scheduleStart ?? '-'}
                  </Text>
                </View>
                <Badge tone={statusTone(student.status)}>{student.status}</Badge>
              </View>
              {index < visible.length - 1 ? <View style={styles.divider} /> : null}
            </View>
          ))}
        </Card>
      ) : null}
    </AppScreen>
  );
}

function statusTone(status: StaffAttendanceResponse['items'][number]['status']) {
  if (status === '입실') return 'primary';
  if (status === '외출') return 'amber';
  if (status === '퇴실') return 'blue';
  return 'red';
}

const styles = StyleSheet.create({
  search: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
  },
  filters: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  filter: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 68,
    paddingHorizontal: spacing.md,
  },
  filterActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  filterTextActive: {
    color: colors.surface,
  },
  count: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  student: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 76,
    paddingHorizontal: spacing.md,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.blueSoft,
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avatarText: {
    color: colors.blue,
    fontSize: 15,
    fontWeight: '800',
  },
  studentText: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  studentName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  studentMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  divider: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
});
