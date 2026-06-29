import { Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import {
  Avatar,
  Badge,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SectionTitle,
} from '@/components/mobile-ui';
import { FormSheet } from '@/components/form-sheet';
import { FormError } from '@/components/workflow-ui';
import { colors, palette, radius, spacing, Tone, type } from '@/constants/theme';
import {
  mutateMobileApi,
  StaffAttendanceItem,
  StaffAttendanceResponse,
  useMobileQuery,
} from '@/lib/mobile-api';

const FILTERS = ['전체', '입실', '외출', '퇴실', '미입실', '결석'] as const;
type AttendanceFilter = (typeof FILTERS)[number];

function statusTone(status: StaffAttendanceItem['status']): Tone {
  if (status === '입실') return 'positive';
  if (status === '외출') return 'warning';
  if (status === '퇴실') return 'blue';
  if (status === '결석') return 'negative';
  return 'neutral';
}

function scheduleText(item: StaffAttendanceItem): string | null {
  if (!item.scheduleStart) return null;
  return item.scheduleEnd
    ? `예정 ${item.scheduleStart}–${item.scheduleEnd}`
    : `예정 ${item.scheduleStart}`;
}

export default function AttendanceScreen() {
  const [filter, setFilter] = useState<AttendanceFilter>('전체');
  const [query, setQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StaffAttendanceItem | null>(null);
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

  const summary = data?.summary;

  return (
    <AppScreen
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="오늘 예정·실제 출결과 외출·특이사항을 한눈에."
      title="입퇴실 관리">
      {summary ? (
        <View style={styles.kpis}>
          <Kpi label="입실" value={summary.present} color={palette.green50} />
          <Kpi label="외출중" value={summary.outing} color={palette.orange50} />
          <Kpi label="지각·확인" value={summary.late} color={palette.red50} />
          <Kpi label="특이사항" value={summary.withNote} color={palette.violet50} />
        </View>
      ) : null}

      <View style={styles.search}>
        <Search color={colors.textAssistive} size={18} />
        <TextInput
          onChangeText={setQuery}
          placeholder="학생 이름 또는 좌석 검색"
          placeholderTextColor={colors.textAssistive}
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
        <Card padded={false} style={styles.listCard}>
          {visible.map((student, index) => {
            const sched = scheduleText(student);
            return (
              <View key={student.id}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSelectedStudent(student)}
                  style={({ pressed }) => [styles.student, pressed && styles.pressed]}>
                  <Avatar
                    label={student.name.slice(0, 1)}
                    size={40}
                    tone={{ background: palette.blue5, foreground: palette.blue50 }}
                  />
                  <View style={styles.studentText}>
                    <View style={styles.nameRow}>
                      <Text style={styles.studentName}>{student.name}</Text>
                      <Text style={styles.studentSub}>
                        {student.grade}
                        {student.seat ? ` · ${student.seat}` : ''}
                      </Text>
                      {student.isLate ? <Badge tone="negative">확인</Badge> : null}
                      {student.note ? <Badge tone="violet">특이</Badge> : null}
                    </View>
                    <Text style={styles.studentMeta} numberOfLines={1}>
                      {student.time ? `${student.status} ${student.time}` : (sched ?? '예정 없음')}
                      {student.outingActive ? ' · 외출중' : ''}
                    </Text>
                  </View>
                  <Badge tone={statusTone(student.status)}>{student.status}</Badge>
                </Pressable>
                {index < visible.length - 1 ? <View style={styles.rowDivider} /> : null}
              </View>
            );
          })}
        </Card>
      ) : null}
      {selectedStudent ? (
        <AttendanceActionSheet
          onClose={() => setSelectedStudent(null)}
          onUpdated={async () => {
            setSelectedStudent(null);
            await refresh();
          }}
          student={selectedStudent}
        />
      ) : null}
    </AppScreen>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

type AttendanceAction =
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'START_OUTING'
  | 'RETURN'
  | 'MARK_ABSENT';

function AttendanceActionSheet({
  onClose,
  onUpdated,
  student,
}: {
  onClose: () => void;
  onUpdated: () => Promise<void>;
  student: StaffAttendanceItem;
}) {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState<AttendanceAction | null>(null);

  async function update(action: AttendanceAction) {
    setError('');
    setSubmitting(action);
    try {
      await mutateMobileApi(`/api/mobile/v1/staff/attendance/${student.id}`, 'PATCH', { action });
      await onUpdated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '출석 상태를 변경하지 못했습니다.');
    } finally {
      setSubmitting(null);
    }
  }

  const busy = submitting !== null;

  return (
    <FormSheet
      onClose={onClose}
      subtitle={`${student.grade}${student.seat ? ` · ${student.seat}` : ''}`}
      title={student.name}
      visible>
      <View style={styles.statusSummary}>
        <Text style={styles.statusLabel}>현재 상태</Text>
        <Badge tone={statusTone(student.status)}>{student.status}</Badge>
      </View>

      {/* 예정 타임라인 */}
      <Card>
        <Text style={styles.cardLabel}>오늘 예정</Text>
        <View style={styles.schedRow}>
          <SchedCell label="입실 예정" value={student.scheduleStart ?? '—'} />
          <View style={styles.schedSep} />
          <SchedCell label="퇴실 예정" value={student.scheduleEnd ?? '—'} />
        </View>
        {student.time ? (
          <>
            <Divider style={{ marginVertical: 12 }} />
            <Text style={styles.actualText}>
              실제: {student.status} {student.time}
            </Text>
          </>
        ) : null}
      </Card>

      {/* 외출 내역 */}
      {student.outings.length > 0 ? (
        <Card>
          <Text style={styles.cardLabel}>외출 {student.outings.length}건</Text>
          {student.outings.map((o, i) => (
            <View key={`${o.sequence}-${i}`}>
              {i > 0 ? <Divider style={{ marginVertical: 10 }} /> : <View style={{ height: 10 }} />}
              <View style={styles.outingRow}>
                <Badge
                  tone={o.status === '외출중' ? 'warning' : o.status === '복귀' ? 'positive' : 'neutral'}>
                  {o.status}
                </Badge>
                <Text style={styles.outingTime}>
                  {o.start ?? '—'}
                  {o.end ? ` ~ ${o.end}` : ''}
                </Text>
                <Text style={styles.outingReason} numberOfLines={1}>
                  {o.reason ?? (o.planned ? '정기 외출' : '')}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {/* 특이사항 */}
      {student.note ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>특이사항</Text>
          <Text style={styles.noteText}>{student.note}</Text>
        </View>
      ) : null}

      <FormError message={error} />

      {/* 상태 변경 */}
      {student.status === '미입실' || student.status === '결석' ? (
        <PrimaryButton disabled={busy} onPress={() => void update('CHECK_IN')}>
          {submitting === 'CHECK_IN' ? '처리 중' : '입실 처리'}
        </PrimaryButton>
      ) : null}
      {student.status === '미입실' ? (
        <PrimaryButton disabled={busy} onPress={() => void update('MARK_ABSENT')} variant="danger">
          {submitting === 'MARK_ABSENT' ? '처리 중' : '결석 처리'}
        </PrimaryButton>
      ) : null}
      {student.status === '입실' ? (
        <PrimaryButton disabled={busy} onPress={() => void update('START_OUTING')} variant="secondary">
          {submitting === 'START_OUTING' ? '처리 중' : '외출 처리'}
        </PrimaryButton>
      ) : null}
      {student.status === '외출' ? (
        <PrimaryButton disabled={busy} onPress={() => void update('RETURN')}>
          {submitting === 'RETURN' ? '처리 중' : '복귀 처리'}
        </PrimaryButton>
      ) : null}
      {student.status === '입실' || student.status === '외출' ? (
        <PrimaryButton disabled={busy} onPress={() => void update('CHECK_OUT')} variant="danger">
          {submitting === 'CHECK_OUT' ? '처리 중' : '퇴실 처리'}
        </PrimaryButton>
      ) : null}
      {student.status === '퇴실' ? (
        <Text style={styles.completedText}>오늘 퇴실 처리가 완료되었습니다.</Text>
      ) : null}
    </FormSheet>
  );
}

function SchedCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.schedCell}>
      <Text style={styles.schedLabel}>{label}</Text>
      <Text style={styles.schedValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: 'row', gap: spacing.sm },
  kpi: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineNeutral,
    borderRadius: radius.xl,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
  },
  kpiValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  kpiLabel: { ...type.caption2, color: colors.textAssistive },

  search: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.lineNeutral,
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  searchInput: { color: colors.textNormal, flex: 1, ...type.body2 },
  filters: { gap: spacing.sm, paddingRight: spacing.lg },
  filter: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.lineNeutral,
    borderRadius: radius.full,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: spacing.lg,
  },
  filterActive: { backgroundColor: colors.inkCard, borderColor: colors.inkCard },
  filterText: { ...type.caption1, color: colors.textAlternative, fontWeight: '600' },
  filterTextActive: { color: colors.textOncolor },
  count: { ...type.caption1, color: colors.textAssistive, fontWeight: '700' },

  listCard: { paddingVertical: 4 },
  student: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 70,
    paddingHorizontal: 14,
  },
  studentText: { flex: 1, gap: 3 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  studentName: { ...type.label1, color: colors.textNormal },
  studentSub: { ...type.caption1, color: colors.textAssistive },
  studentMeta: { ...type.caption1, color: colors.textAssistive },
  rowDivider: { height: 1, backgroundColor: colors.lineAlt, marginLeft: 68 },
  pressed: { opacity: 0.72 },

  statusSummary: {
    alignItems: 'center',
    backgroundColor: colors.bgSunken,
    borderRadius: radius.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  statusLabel: { ...type.label1, color: colors.textNormal },

  cardLabel: { ...type.label2, color: colors.textAssistive, marginBottom: 10 },
  schedRow: { flexDirection: 'row', alignItems: 'center' },
  schedCell: { flex: 1, alignItems: 'center', gap: 4 },
  schedSep: { width: 1, height: 36, backgroundColor: colors.lineAlt },
  schedLabel: { ...type.caption1, color: colors.textAssistive },
  schedValue: { fontSize: 20, fontWeight: '700', color: colors.textNormal, letterSpacing: -0.3 },
  actualText: { ...type.body3, color: colors.textNormal },

  outingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outingTime: { ...type.caption1, color: colors.textNormal, fontWeight: '600' },
  outingReason: { ...type.caption1, color: colors.textAssistive, flex: 1 },

  noteBox: {
    backgroundColor: palette.violet5,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: 4,
  },
  noteLabel: { ...type.caption2, color: palette.violet50, fontWeight: '700' },
  noteText: { ...type.body3, color: colors.textNormal, lineHeight: 20 },

  completedText: { ...type.body3, color: colors.textAssistive, textAlign: 'center' },
});
