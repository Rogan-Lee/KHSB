import { Check, Search, ShieldCheck, Smartphone, SearchX, X } from 'lucide-react-native';
import { memo, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  color,
  confirm,
  EmptyState,
  ErrorState,
  GroupLabel,
  Press,
  ProgressBar,
  radius,
  Screen,
  Section,
  Skeleton,
  space,
  Stack,
  StatGrid,
  Text,
  TextField,
  toast,
  TONE_SOFT,
  type Tone,
} from '@/design';
import { OfflineOpsLocked, useOfflineOpsAllowed } from '@/features/staff-ops/access';
import { FooterSlot, useSheetSession } from '@/features/staff-ops/attendance-controls';
import { DateStepper } from '@/features/staff-ops/merit-sheet';
import { matchesStudent, todayKstKey, shiftDateKey } from '@/features/staff-ops/status';
import {
  bulkPhoneSubmitted,
  setPhoneCheck,
  type PhoneCheckResponse,
  type PhoneCheckRow,
  type PhoneCheckStatus,
} from '@/lib/api/staff-ops';
import { useMobileQuery } from '@/lib/mobile-api';
import { useResponsive } from '@/lib/responsive';

const META: Record<PhoneCheckStatus, { label: string; tone: Tone }> = {
  SUBMITTED: { label: '제출', tone: 'ok' },
  NOT_SUBMITTED: { label: '미제출', tone: 'bad' },
  EXEMPT: { label: '면제', tone: 'info' },
  ABSENT: { label: '미입실', tone: 'gray' },
};
const TOGGLES: PhoneCheckStatus[] = ['SUBMITTED', 'NOT_SUBMITTED', 'EXEMPT'];
const ALL: PhoneCheckStatus[] = ['SUBMITTED', 'NOT_SUBMITTED', 'EXEMPT', 'ABSENT'];

type Filter = 'all' | 'unchecked' | PhoneCheckStatus;
const FILTER_LABEL: Record<Filter, string> = {
  all: '전체',
  unchecked: '미검사',
  SUBMITTED: '제출',
  NOT_SUBMITTED: '미제출',
  EXEMPT: '면제',
  ABSENT: '미입실',
};

/** 기록 없는 미입실 학생은 '미입실'로 본다 (웹과 동일) */
function effective(r: PhoneCheckRow): PhoneCheckStatus | null {
  return r.record?.status ?? (r.checkedIn ? null : 'ABSENT');
}

/** 휴대폰 제출 검사 — 오늘(또는 지난 날짜) 보드. 버튼 한 번으로 제출·미제출·면제 */
export default function StaffPhoneCheckScreen() {
  const allowed = useOfflineOpsAllowed();
  if (!allowed) return <OfflineOpsLocked title="휴대폰 제출" />;
  return <PhoneCheckBoard />;
}

function PhoneCheckBoard() {
  const { isTablet } = useResponsive();
  const today = todayKstKey();
  const [date, setDate] = useState(today);
  const { data, error, isLoading, isRefreshing, refresh, retry } = useMobileQuery<PhoneCheckResponse>(
    `/api/mobile/v1/staff/phone-check?date=${date}`
  );
  // 누른 즉시 반영(낙관적) — 날짜별로 따로 보관
  const [overrides, setOverrides] = useState<Record<string, PhoneCheckRow['record']>>({});
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<{ row: PhoneCheckRow; open: boolean } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const fresh = !!data && data.date === date;
  const rows = useMemo(
    () =>
      fresh && data
        ? data.rows.map((r) => (r.studentId in overrides ? { ...r, record: overrides[r.studentId] } : r))
        : [],
    [data, fresh, overrides]
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: rows.length,
      unchecked: 0,
      SUBMITTED: 0,
      NOT_SUBMITTED: 0,
      EXEMPT: 0,
      ABSENT: 0,
    };
    for (const r of rows) {
      const st = effective(r);
      if (st) c[st] += 1;
      else c.unchecked += 1;
    }
    return c;
  }, [rows]);

  const checkedInTotal = rows.filter((r) => r.checkedIn).length;
  const checkedInDone = rows.filter((r) => r.checkedIn && r.record).length;
  const uncheckedInIds = rows.filter((r) => r.checkedIn && !r.record).map((r) => r.studentId);

  const visible = useMemo(
    () =>
      rows.filter((r) => {
        if (!matchesStudent(r, query)) return false;
        if (filter === 'all') return true;
        const st = effective(r);
        return filter === 'unchecked' ? st === null : st === filter;
      }),
    [rows, query, filter]
  );

  const changeDate = (next: string) => {
    setOverrides({});
    setDate(next);
  };

  const apply = async (row: PhoneCheckRow, status: PhoneCheckStatus, note?: string | null) => {
    const prev = row.record;
    const nextNote = status === 'NOT_SUBMITTED' ? (note ?? prev?.note ?? null) : null;
    setOverrides((o) => ({ ...o, [row.studentId]: { status, note: nextNote } }));
    try {
      await setPhoneCheck(row.studentId, { date, status, note: nextNote });
      return true;
    } catch (e) {
      setOverrides((o) => ({ ...o, [row.studentId]: prev }));
      toast(e instanceof Error ? e.message : '저장하지 못했어요', 'error');
      return false;
    }
  };

  const bulk = async () => {
    if (bulkBusy || uncheckedInIds.length === 0) return;
    const ok = await confirm({
      title: `입실자 ${uncheckedInIds.length}명을 모두 '제출'로 기록할까요?`,
      message: '아직 검사하지 않은 입실 학생만 바뀌어요.',
      confirmText: '모두 제출',
    });
    if (!ok) return;
    setBulkBusy(true);
    const ids = [...uncheckedInIds];
    setOverrides((o) => {
      const next = { ...o };
      ids.forEach((id) => (next[id] = { status: 'SUBMITTED', note: null }));
      return next;
    });
    try {
      const { count } = await bulkPhoneSubmitted({ date, studentIds: ids });
      toast(`${count}명을 제출로 기록했어요`, 'success');
    } catch (e) {
      setOverrides((o) => {
        const next = { ...o };
        ids.forEach((id) => delete next[id]);
        return next;
      });
      toast(e instanceof Error ? e.message : '일괄 처리하지 못했어요', 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <Screen
      kind="push"
      title="휴대폰 제출"
      backFallback="/(staff)/(tabs)"
      maxWidth={isTablet ? 720 : undefined}
      refreshing={isRefreshing}
      onRefresh={() => {
        setOverrides({});
        void refresh();
      }}
      footer={
        fresh && checkedInTotal > 0 ? (
          <Button
            block
            icon={Check}
            loading={bulkBusy}
            disabled={uncheckedInIds.length === 0}
            onPress={() => void bulk()}>
            {uncheckedInIds.length > 0
              ? `입실자 ${uncheckedInIds.length}명 모두 제출`
              : '입실자 검사를 다 했어요'}
          </Button>
        ) : undefined
      }>
      <Stack>
        <Section>
          <View style={s.dateRow}>
            <Smartphone color={color.fg.brand} size={20} strokeWidth={2.2} />
            <Text variant="t5-bold" style={{ flex: 1 }}>
              검사 날짜
            </Text>
            <DateStepper value={date} min={shiftDateKey(today, -30)} max={today} onChange={changeDate} />
          </View>
          {fresh && (
            <View style={{ marginTop: space.x4, gap: space.x3 }}>
              <StatGrid
                items={[
                  { label: '제출', value: counts.SUBMITTED, tone: 'positive' },
                  {
                    label: '미제출',
                    value: counts.NOT_SUBMITTED,
                    tone: counts.NOT_SUBMITTED ? 'critical' : 'neutral',
                  },
                  { label: '면제', value: counts.EXEMPT, tone: 'informative' },
                  {
                    label: '미검사',
                    value: counts.unchecked,
                    tone: counts.unchecked ? 'warning' : 'neutral',
                  },
                ]}
              />
              <View style={{ gap: space.x1_5 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="t3-regular" color="neutralSubtle">
                    입실자 검사
                  </Text>
                  <Text variant="t3-bold" tabular>
                    {`${checkedInDone} / ${checkedInTotal}명`}
                  </Text>
                </View>
                <ProgressBar value={checkedInTotal ? checkedInDone / checkedInTotal : 0} tone="ok" />
              </View>
            </View>
          )}
        </Section>

        {(isLoading || !fresh) && !error ? (
          <BoardSkeleton />
        ) : error && !fresh ? (
          <ErrorState message={error} onRetry={() => void retry()} />
        ) : (
          <>
            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="이름·좌석으로 찾기"
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.chipScroll}
              contentContainerStyle={s.chipRow}>
              {(['all', 'unchecked', 'SUBMITTED', 'NOT_SUBMITTED', 'EXEMPT', 'ABSENT'] as Filter[]).map(
                (f) => (
                  <Chip key={f} selected={filter === f} onPress={() => setFilter(f)}>
                    {`${FILTER_LABEL[f]} ${counts[f]}`}
                  </Chip>
                )
              )}
            </ScrollView>

            <View>
              <GroupLabel trailing="이름을 누르면 사유까지 적을 수 있어요">좌석순</GroupLabel>
              {visible.length === 0 ? (
                <Section>
                  <EmptyState
                    icon={SearchX}
                    title={rows.length === 0 ? '자습실 학생이 없어요' : '조건에 맞는 학생이 없어요'}
                    description={rows.length === 0 ? undefined : '검색어나 필터를 바꿔 보세요.'}
                  />
                </Section>
              ) : (
                <Section flush>
                  {visible.map((r) => (
                    <PhoneRow
                      key={r.studentId}
                      row={r}
                      onToggle={(st) => void apply(r, st)}
                      onOpen={() => setEditing({ row: r, open: true })}
                    />
                  ))}
                </Section>
              )}
            </View>
          </>
        )}
      </Stack>

      <StatusSheet
        row={editing?.row ?? null}
        open={!!editing?.open}
        onClose={() => setEditing((e) => (e ? { ...e, open: false } : e))}
        onSave={(st, note) => (editing ? apply(editing.row, st, note) : Promise.resolve(false))}
      />
    </Screen>
  );
}

const PhoneRow = memo(function PhoneRow({
  row,
  onToggle,
  onOpen,
}: {
  row: PhoneCheckRow;
  onToggle: (s: PhoneCheckStatus) => void;
  onOpen: () => void;
}) {
  const st = effective(row);
  const tone = st ? META[st].tone : 'warn';
  return (
    <View style={s.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Press
          onPress={onOpen}
          scale={0}
          pressedBg
          style={s.rowMain}
          accessibilityLabel={`${row.name} 검사 상태 자세히`}>
          <View style={[s.tile, { backgroundColor: TONE_SOFT[tone].bg }]}>
            <Text
              variant={row.seat && row.seat.length > 2 ? 't3-bold' : 't5-bold'}
              color={TONE_SOFT[tone].fg}
              tabular>
              {row.seat?.trim() || '–'}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
            <Text variant="t5-medium" numberOfLines={1}>
              {row.name}
            </Text>
            <Text
              variant="t3-regular"
              color={st === 'NOT_SUBMITTED' && row.record?.note ? 'critical' : 'neutralSubtle'}
              numberOfLines={1}
              tabular>
              {st === 'NOT_SUBMITTED'
                ? row.record?.note || '사유 추가'
                : row.checkedIn
                  ? `${row.checkInAt} 입실${st ? '' : ' · 미검사'}`
                  : '미입실'}
            </Text>
          </View>
        </Press>
      </View>
      <View style={s.toggles}>
        {TOGGLES.map((t) => {
          const on = st === t;
          const c = TONE_SOFT[META[t].tone];
          return (
            <Press
              key={t}
              onPress={() => onToggle(t)}
              scale={0.94}
              accessibilityRole="button"
              accessibilityLabel={`${row.name} ${META[t].label}`}
              accessibilityState={{ selected: on }}
              style={[
                s.toggle,
                on
                  ? { backgroundColor: c.bg, borderColor: c.fg }
                  : { backgroundColor: color.bg.layerDefault, borderColor: color.stroke.neutralWeak },
              ]}>
              {t === 'EXEMPT' && on ? (
                <ShieldCheck color={c.fg} size={16} strokeWidth={2.4} />
              ) : (
                <Text
                  variant="t3-bold"
                  color={on ? c.fg : 'neutralSubtle'}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}>
                  {META[t].label}
                </Text>
              )}
            </Press>
          );
        })}
      </View>
    </View>
  );
});

function StatusSheet({
  row,
  open,
  onClose,
  onSave,
}: {
  row: PhoneCheckRow | null;
  open: boolean;
  onClose: () => void;
  onSave: (status: PhoneCheckStatus, note: string | null) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<PhoneCheckStatus>('SUBMITTED');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useSheetSession(open, row?.studentId ?? null, () => {
    setStatus(row ? (effective(row) ?? 'SUBMITTED') : 'SUBMITTED');
    setNote(row?.record?.note ?? '');
  });

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await onSave(status, status === 'NOT_SUBMITTED' ? note.trim() || null : null);
    setSaving(false);
    if (!ok) return;
    toast('검사 상태를 저장했어요', 'success');
    onClose();
  };

  return (
    <BottomSheet
      open={open && !!row}
      onClose={onClose}
      title={row?.name}
      description={
        row
          ? `${row.seat ? `좌석 ${row.seat} · ` : ''}${row.checkedIn ? `${row.checkInAt} 입실` : '미입실'}`
          : undefined
      }
      footer={
        <>
          <FooterSlot>
            <Button variant="gray" block onPress={onClose} disabled={saving}>
              취소
            </Button>
          </FooterSlot>
          <FooterSlot>
            <Button block loading={saving} onPress={() => void save()}>
              저장
            </Button>
          </FooterSlot>
        </>
      }>
      <Text variant="t5-medium">검사 상태</Text>
      <ChipGroup>
        {ALL.map((st) => (
          <Chip key={st} size="lg" selected={status === st} onPress={() => setStatus(st)}>
            {META[st].label}
          </Chip>
        ))}
      </ChipGroup>
      {status === 'NOT_SUBMITTED' && (
        <View style={{ paddingTop: space.x2 }}>
          <TextField
            label="미제출 사유"
            indicator="선택"
            value={note}
            onChangeText={setNote}
            placeholder="예: 공기계 제출, 집에 두고 옴"
            maxLength={200}
          />
        </View>
      )}
    </BottomSheet>
  );
}

function BoardSkeleton() {
  return (
    <View style={s.skelCard}>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <View
          key={i}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3, paddingVertical: space.x2 }}>
          <Skeleton style={{ width: 44, height: 44, borderRadius: radius.r3 }} />
          <View style={{ flex: 1, gap: space.x1_5 }}>
            <Skeleton style={{ width: '50%', height: 16 }} />
            <Skeleton style={{ width: '70%', height: 12 }} />
          </View>
          <Skeleton style={{ width: 150, height: 44, borderRadius: radius.r2_5 }} />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    marginHorizontal: space.x2,
    paddingRight: space.x3,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2_5,
    borderRadius: radius.r4,
  },
  tile: { width: 44, height: 44, borderRadius: radius.r3, alignItems: 'center', justifyContent: 'center' },
  toggles: { flexDirection: 'row', gap: space.x1_5 },
  toggle: {
    width: 50,
    height: 44,
    borderRadius: radius.r2_5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skelCard: { backgroundColor: color.bg.layerDefault, borderRadius: radius.r5, padding: space.x5 },
});
