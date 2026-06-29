import { Search } from 'lucide-react-native';
import { ReactNode, useMemo, useState } from 'react';
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
  Segmented,
} from '@/components/mobile-ui';
import { FormSheet } from '@/components/form-sheet';
import { FormError } from '@/components/workflow-ui';
import { colors, palette, radius, spacing, Tone, type } from '@/constants/theme';
import {
  mutateMobileApi,
  StaffAttendanceItem,
  StaffAttendanceResponse,
  StaffStudentDetail,
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

type SheetTab = 'attendance' | 'info' | 'tasks' | 'scores';
const SHEET_TABS: { label: string; value: SheetTab }[] = [
  { label: '입퇴실', value: 'attendance' },
  { label: '기본정보', value: 'info' },
  { label: '과제', value: 'tasks' },
  { label: '성적', value: 'scores' },
];

function AttendanceActionSheet({
  onClose,
  onUpdated,
  student,
}: {
  onClose: () => void;
  onUpdated: () => Promise<void>;
  student: StaffAttendanceItem;
}) {
  const [tab, setTab] = useState<SheetTab>('attendance');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState<AttendanceAction | null>(null);
  const [times, setTimes] = useState({
    checkIn: student.checkIn ?? '',
    checkOut: student.checkOut ?? '',
  });
  const [note, setNote] = useState(student.note ?? '');
  const [savingTimes, setSavingTimes] = useState(false);
  const [outingDraft, setOutingDraft] = useState({ start: '', end: '', reason: '' });
  const [outingBusy, setOutingBusy] = useState(false);

  const detail = useMobileQuery<StaffStudentDetail>(
    `/api/mobile/v1/staff/student/${student.id}`,
  );

  function patch(body: Record<string, unknown>) {
    return mutateMobileApi(`/api/mobile/v1/staff/attendance/${student.id}`, 'PATCH', body);
  }

  async function saveTimes() {
    setError('');
    if ([times.checkIn, times.checkOut].some((v) => v.trim() && !/^\d{2}:\d{2}$/.test(v.trim()))) {
      setError('시간은 HH:MM 형식으로 입력하세요 (예: 09:30)');
      return;
    }
    setSavingTimes(true);
    try {
      await patch({
        action: 'SET_TIMES',
        checkIn: times.checkIn.trim() || null,
        checkOut: times.checkOut.trim() || null,
        notes: note.trim() || null,
      });
      await onUpdated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '저장하지 못했습니다.');
    } finally {
      setSavingTimes(false);
    }
  }

  async function update(action: AttendanceAction) {
    setError('');
    setSubmitting(action);
    try {
      await patch({ action });
      await onUpdated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '출석 상태를 변경하지 못했습니다.');
    } finally {
      setSubmitting(null);
    }
  }

  async function addOuting() {
    setError('');
    if (!/^\d{2}:\d{2}$/.test(outingDraft.start.trim())) {
      setError('외출 시작 시각을 HH:MM으로 입력하세요');
      return;
    }
    if (outingDraft.end.trim() && !/^\d{2}:\d{2}$/.test(outingDraft.end.trim())) {
      setError('복귀 시각 형식이 올바르지 않습니다');
      return;
    }
    setOutingBusy(true);
    try {
      await patch({
        action: 'ADD_OUTING',
        outStart: outingDraft.start.trim(),
        outEnd: outingDraft.end.trim() || null,
        reason: outingDraft.reason.trim() || null,
      });
      await onUpdated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '외출을 추가하지 못했습니다.');
    } finally {
      setOutingBusy(false);
    }
  }

  async function removeOuting(id: string) {
    setError('');
    setOutingBusy(true);
    try {
      await patch({ action: 'DELETE_OUTING', outingId: id });
      await onUpdated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '외출을 삭제하지 못했습니다.');
    } finally {
      setOutingBusy(false);
    }
  }

  const busy = submitting !== null || savingTimes || outingBusy;

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

      <View style={{ marginBottom: 4 }}>
        <Segmented
          onChange={(v) => setTab(v as SheetTab)}
          options={SHEET_TABS}
          value={tab}
        />
      </View>

      <FormError message={error} />

      {tab === 'attendance' ? (
        <>
          {/* 예정 + 실제 */}
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

          {/* 입실·퇴실 직접 입력 */}
          <Card>
            <Text style={styles.cardLabel}>입실·퇴실 직접 입력</Text>
            <View style={styles.editGrid}>
              <TimeField
                label="입실"
                onChangeText={(v) => setTimes((t) => ({ ...t, checkIn: v }))}
                value={times.checkIn}
              />
              <TimeField
                label="퇴실"
                onChangeText={(v) => setTimes((t) => ({ ...t, checkOut: v }))}
                value={times.checkOut}
              />
            </View>
            <Text style={styles.editHint}>비워두면 해당 기록이 삭제됩니다.</Text>
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>비고</Text>
            <TextInput
              onChangeText={setNote}
              placeholder="특이사항 메모"
              placeholderTextColor={colors.textAssistive}
              style={styles.noteInput}
              value={note}
            />
            <View style={{ marginTop: 12 }}>
              <PrimaryButton disabled={busy} onPress={() => void saveTimes()}>
                {savingTimes ? '저장 중' : '입실·퇴실 저장'}
              </PrimaryButton>
            </View>
          </Card>

          {/* 외출 관리 */}
          <Card>
            <Text style={styles.cardLabel}>외출 관리</Text>
            {student.outings.length > 0 ? (
              student.outings.map((o, i) => (
                <View key={o.id ?? `p-${i}`}>
                  {i > 0 ? (
                    <Divider style={{ marginVertical: 8 }} />
                  ) : (
                    <View style={{ height: 6 }} />
                  )}
                  <View style={styles.outingRow}>
                    <Badge
                      tone={
                        o.status === '외출중'
                          ? 'warning'
                          : o.status === '복귀'
                            ? 'positive'
                            : 'neutral'
                      }>
                      {o.status}
                    </Badge>
                    <Text style={styles.outingTime}>
                      {o.start ?? '—'}
                      {o.end ? ` ~ ${o.end}` : ''}
                    </Text>
                    <Text style={styles.outingReason} numberOfLines={1}>
                      {o.reason ?? (o.planned ? '정기 외출' : '')}
                    </Text>
                    {o.id ? (
                      <Pressable
                        disabled={busy}
                        hitSlop={8}
                        onPress={() => void removeOuting(o.id as string)}>
                        <Text style={styles.deleteLink}>삭제</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.editHint}>외출 기록이 없습니다.</Text>
            )}

            <Divider style={{ marginVertical: 12 }} />
            <Text style={styles.fieldLabel}>외출 추가</Text>
            <View style={styles.outingAddRow}>
              <TextInput
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                onChangeText={(v) => setOutingDraft((d) => ({ ...d, start: v }))}
                placeholder="시작"
                placeholderTextColor={colors.textAssistive}
                style={[styles.timeInput, styles.outingTimeInput]}
                value={outingDraft.start}
              />
              <TextInput
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                onChangeText={(v) => setOutingDraft((d) => ({ ...d, end: v }))}
                placeholder="복귀(선택)"
                placeholderTextColor={colors.textAssistive}
                style={[styles.timeInput, styles.outingTimeInput]}
                value={outingDraft.end}
              />
            </View>
            <TextInput
              onChangeText={(v) => setOutingDraft((d) => ({ ...d, reason: v }))}
              placeholder="사유(선택, 예: 수학학원)"
              placeholderTextColor={colors.textAssistive}
              style={[styles.noteInput, { marginTop: 8 }]}
              value={outingDraft.reason}
            />
            <View style={{ marginTop: 10 }}>
              <PrimaryButton disabled={busy} onPress={() => void addOuting()} variant="secondary">
                {outingBusy ? '추가 중' : '외출 추가'}
              </PrimaryButton>
            </View>
          </Card>

          {/* 빠른 상태 변경 */}
          {student.status === '미입실' || student.status === '결석' ? (
            <PrimaryButton disabled={busy} onPress={() => void update('CHECK_IN')}>
              {submitting === 'CHECK_IN' ? '처리 중' : '지금 입실'}
            </PrimaryButton>
          ) : null}
          {student.status === '미입실' ? (
            <PrimaryButton disabled={busy} onPress={() => void update('MARK_ABSENT')} variant="danger">
              {submitting === 'MARK_ABSENT' ? '처리 중' : '결석 처리'}
            </PrimaryButton>
          ) : null}
          {student.status === '입실' ? (
            <PrimaryButton
              disabled={busy}
              onPress={() => void update('START_OUTING')}
              variant="secondary">
              {submitting === 'START_OUTING' ? '처리 중' : '지금 외출'}
            </PrimaryButton>
          ) : null}
          {student.status === '외출' ? (
            <PrimaryButton disabled={busy} onPress={() => void update('RETURN')}>
              {submitting === 'RETURN' ? '처리 중' : '지금 복귀'}
            </PrimaryButton>
          ) : null}
          {student.status === '입실' || student.status === '외출' ? (
            <PrimaryButton disabled={busy} onPress={() => void update('CHECK_OUT')} variant="danger">
              {submitting === 'CHECK_OUT' ? '처리 중' : '지금 퇴실'}
            </PrimaryButton>
          ) : null}
          {student.status === '퇴실' ? (
            <Text style={styles.completedText}>오늘 퇴실 처리가 완료되었습니다.</Text>
          ) : null}
        </>
      ) : (
        <DetailBody detail={detail}>
          {(d) =>
            tab === 'info' ? (
              <InfoTab info={d.info} />
            ) : tab === 'tasks' ? (
              <TasksTab items={d.assignments} />
            ) : (
              <ScoresTab items={d.scores} />
            )
          }
        </DetailBody>
      )}
    </FormSheet>
  );
}

type DetailQuery = {
  data: StaffStudentDetail | null;
  error: string | null;
  isLoading: boolean;
  retry: () => void;
};

function DetailBody({
  detail,
  children,
}: {
  detail: DetailQuery;
  children: (d: StaffStudentDetail) => ReactNode;
}) {
  if (detail.isLoading && !detail.data) return <LoadingState />;
  if (detail.error && !detail.data) {
    return <ErrorState message={detail.error} onRetry={() => void detail.retry()} />;
  }
  if (!detail.data) return null;
  return <>{children(detail.data)}</>;
}

function InfoTab({ info }: { info: StaffStudentDetail['info'] }) {
  const rows: [string, string][] = [
    ['학교', info.school || '—'],
    ['학년', info.grade || '—'],
    ['반', info.classGroup || '—'],
    ['좌석', info.seat ? `${info.seat}번` : '—'],
    ['학생 연락처', info.phone || '—'],
    ['학부모 연락처', info.parentPhone || '—'],
    ['학부모 이메일', info.parentEmail || '—'],
    ['등록일', info.startDate || '—'],
    ['희망 대학', info.targetUniversity || '—'],
    ['입시 전형', info.admissionType || '—'],
    ['내신 성적대', info.internalScoreRange || '—'],
    ['모의 성적대', info.mockScoreRange || '—'],
    ['선택과목', info.selectedSubjects || '—'],
    ['수강 인강', info.onlineLectures || '—'],
  ];
  const blocks: [string, string | null][] = [
    ['멘토링 주의사항', info.mentoringNotes],
    ['학생 메모', info.studentInfo],
    ['변동 예정', info.changeNote],
  ];
  return (
    <Card>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.infoRow}>
          <Text style={styles.infoKey}>{k}</Text>
          <Text style={styles.infoVal}>{v}</Text>
        </View>
      ))}
      {blocks
        .filter(([, v]) => !!v)
        .map(([k, v]) => (
          <View key={k} style={styles.infoBlock}>
            <Text style={styles.infoKey}>{k}</Text>
            <Text style={styles.infoBlockText}>{v}</Text>
          </View>
        ))}
    </Card>
  );
}

function TasksTab({ items }: { items: StaffStudentDetail['assignments'] }) {
  if (items.length === 0) return <EmptyState message="등록된 과제가 없습니다." />;
  return (
    <Card padded={false} style={{ paddingVertical: 4 }}>
      {items.map((a, i) => (
        <View key={a.id}>
          {i > 0 ? <View style={styles.rowDivider} /> : null}
          <View style={styles.detailRow}>
            <Badge tone={a.isCompleted ? 'positive' : 'warning'}>
              {a.isCompleted ? '완료' : '진행'}
            </Badge>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailTitle}>{a.title}</Text>
              <Text style={styles.detailMeta}>
                {[a.subject, a.dueDate ? `~${a.dueDate}` : null].filter(Boolean).join(' · ') || '—'}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </Card>
  );
}

const EXAM_TYPE_LABEL: Record<StaffStudentDetail['scores'][number]['examType'], string> = {
  OFFICIAL_MOCK: '모의(공식)',
  PRIVATE_MOCK: '모의(사설)',
  SCHOOL_EXAM: '내신',
};

function ScoresTab({ items }: { items: StaffStudentDetail['scores'] }) {
  if (items.length === 0) return <EmptyState message="등록된 성적이 없습니다." />;
  return (
    <Card padded={false} style={{ paddingVertical: 4 }}>
      {items.map((s, i) => (
        <View key={s.id}>
          {i > 0 ? <View style={styles.rowDivider} /> : null}
          <View style={styles.detailRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailTitle}>
                {s.subject} · {s.examName}
              </Text>
              <Text style={styles.detailMeta}>
                {[EXAM_TYPE_LABEL[s.examType], s.examDate].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {s.grade != null ? <Text style={styles.scoreGrade}>{s.grade}등급</Text> : null}
              <Text style={styles.detailMeta}>
                {[
                  s.rawScore != null ? `${s.rawScore}점` : null,
                  s.percentile != null ? `${s.percentile}%` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </Card>
  );
}

function TimeField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.timeField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        onChangeText={onChangeText}
        placeholder="--:--"
        placeholderTextColor={colors.textAssistive}
        style={styles.timeInput}
        value={value}
      />
    </View>
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

  editGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeField: { flexBasis: '47%', flexGrow: 1, gap: 4 },
  fieldLabel: { ...type.caption1, color: colors.textAssistive },
  timeInput: {
    backgroundColor: colors.bgSunken,
    borderColor: colors.lineNeutral,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: colors.textNormal,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    textAlign: 'center',
  },
  editHint: { ...type.caption2, color: colors.textAssistive, marginTop: 8 },
  noteInput: {
    backgroundColor: colors.bgSunken,
    borderColor: colors.lineNeutral,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: colors.textNormal,
    marginTop: 4,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    ...type.body3,
  },
  schedRow: { flexDirection: 'row', alignItems: 'center' },
  schedCell: { flex: 1, alignItems: 'center', gap: 4 },
  schedSep: { width: 1, height: 36, backgroundColor: colors.lineAlt },
  schedLabel: { ...type.caption1, color: colors.textAssistive },
  schedValue: { fontSize: 20, fontWeight: '700', color: colors.textNormal, letterSpacing: -0.3 },
  actualText: { ...type.body3, color: colors.textNormal },

  outingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outingTime: { ...type.caption1, color: colors.textNormal, fontWeight: '600' },
  outingReason: { ...type.caption1, color: colors.textAssistive, flex: 1 },
  deleteLink: { ...type.caption1, color: colors.negative, fontWeight: '700' },
  outingAddRow: { flexDirection: 'row', gap: spacing.sm },
  outingTimeInput: { flex: 1, fontSize: 15, textAlign: 'left' },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: 6,
  },
  infoKey: { ...type.caption1, color: colors.textAssistive },
  infoVal: { ...type.body3, color: colors.textNormal, flex: 1, textAlign: 'right' },
  infoBlock: { marginTop: 10, gap: 4 },
  infoBlockText: { ...type.body3, color: colors.textNormal, lineHeight: 20 },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  detailTitle: { ...type.label1, color: colors.textNormal },
  detailMeta: { ...type.caption1, color: colors.textAssistive, marginTop: 2 },
  scoreGrade: { ...type.label1, color: colors.textNormal, fontWeight: '800' },

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
