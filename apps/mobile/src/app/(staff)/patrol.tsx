import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { ScanLine, Search, Square, UsersRound } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  Badge,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  ListRow,
  Notice,
  ProgressBar,
  Screen,
  Section,
  SegmentTabs,
  Segmented,
  Stack,
  Text,
  TextField,
  color,
  confirm,
  radius,
  space,
  toast,
  type Tone,
} from '@/design';
import { errorText, usePullRefresh } from '@/features/staff-home/hooks';
import { kstTime } from '@/features/staff-home/format';
import { ListSkeleton, SeatTile, StatSkeleton } from '@/features/staff-home/ui';
import {
  endPatrol,
  savePatrolRecord,
  startPatrol,
  STAFF_API,
  type PatrolStatus,
  type PatrolStudent,
  type StaffPatrolResponse,
} from '@/lib/api/staff-home';
import { refreshBadges } from '@/lib/badges';
import { useMobileQuery } from '@/lib/mobile-api';
import { decodeStudentQr } from '@/lib/patrol';

const STATUS: Record<PatrolStatus, { label: string; tone: Tone }> = {
  OK: { label: '양호', tone: 'ok' },
  NOTE: { label: '특이사항', tone: 'warn' },
  ABSENT: { label: '자리 비움', tone: 'bad' },
};

const CAN_SCAN = Platform.OS !== 'web';

/** 순찰 — 회차 시작/종료, 좌석 QR 스캔 또는 명단에서 골라 점검 기록 */
export default function StaffPatrolScreen() {
  const { data, error, isLoading, refresh, retry } = useMobileQuery<StaffPatrolResponse>(STAFF_API.patrol);
  const { refreshing, onRefresh } = usePullRefresh(refresh);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState<'start' | 'end' | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [selected, setSelected] = useState<PatrolStudent | null>(null);
  const scanLock = useRef(false);
  const lastBadScan = useRef(0);

  const round = data?.activeRound ?? null;
  const records = useMemo(
    () => new Map((data?.records ?? []).map((r) => [r.studentId, r])),
    [data?.records]
  );

  const counts = useMemo(() => {
    const c = { OK: 0, NOTE: 0, ABSENT: 0 };
    for (const r of data?.records ?? []) c[r.status] += 1;
    return c;
  }, [data?.records]);

  const list = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (q) {
      return data.allStudents.filter((st) =>
        `${st.name} ${st.grade} ${st.seat ?? ''}`.toLowerCase().includes(q)
      );
    }
    return data.roster.filter((st) => (tab === 'done' ? records.has(st.id) : !records.has(st.id)));
  }, [data, query, tab, records]);

  const rosterChecked = data ? data.roster.filter((st) => records.has(st.id)).length : 0;

  async function onStart() {
    if (busy) return;
    setBusy('start');
    try {
      const res = await startPatrol();
      toast(res.reused ? '진행 중인 순찰을 이어서 해요' : '순찰을 시작했어요', 'success');
      await refresh();
      refreshBadges();
    } catch (e) {
      toast(errorText(e, '순찰을 시작하지 못했어요'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function onEnd() {
    if (!round || busy) return;
    const ok = await confirm({
      title: '순찰을 마칠까요?',
      message: `${data?.records.length ?? 0}명을 점검했어요. 종료하면 이 회차에는 더 기록할 수 없어요.`,
      confirmText: '순찰 종료',
      destructive: true,
    });
    if (!ok) return;
    setBusy('end');
    try {
      await endPatrol(round.id);
      setScanning(false);
      setSelected(null);
      toast('순찰을 마쳤어요', 'success');
      await refresh();
    } catch (e) {
      toast(errorText(e, '순찰을 종료하지 못했어요'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function openScanner() {
    if (!CAN_SCAN) return;
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        toast('QR을 찍으려면 카메라 권한을 허용해 주세요', 'error');
        return;
      }
    }
    scanLock.current = false;
    setScanning(true);
  }

  function handleScan(result: BarcodeScanningResult) {
    if (!data || scanLock.current) return;
    const studentId = decodeStudentQr(result.data);
    const student = studentId ? data.allStudents.find((st) => st.id === studentId) : undefined;
    if (!student) {
      // 같은 코드가 연속으로 읽히므로 안내는 2.5초에 한 번만
      const now = Date.now();
      if (now - lastBadScan.current > 2500) {
        lastBadScan.current = now;
        toast(studentId ? '재원 중인 학생을 찾지 못했어요' : '강한선배 좌석 QR이 아니에요', 'error');
      }
      return;
    }
    scanLock.current = true;
    setScanning(false);
    setSelected(student);
  }

  const footer =
    data && !round ? (
      <Button block icon={ScanLine} loading={busy === 'start'} onPress={() => void onStart()}>
        순찰 시작하기
      </Button>
    ) : data && round && CAN_SCAN && !scanning ? (
      <Button block icon={ScanLine} onPress={() => void openScanner()}>
        좌석 QR 찍기
      </Button>
    ) : undefined;

  return (
    <Screen
      kind="push"
      title="순찰"
      backFallback="/(staff)/(tabs)"
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={footer}>
      {!data ? (
        error && !isLoading ? (
          <ErrorState message={error} onRetry={() => void retry()} />
        ) : (
          <Stack>
            <StatSkeleton />
            <ListSkeleton rows={5} />
          </Stack>
        )
      ) : !round ? (
        <Section>
          <EmptyState
            icon={ScanLine}
            tone="brand"
            title="진행 중인 순찰이 없어요"
            description={`순찰을 시작하면 재실 학생 ${data.roster.length}명의 좌석을 돌며 점검을 기록해요.`}
          />
        </Section>
      ) : (
        <Stack>
          <Section
            title={round.label || '진행 중인 순찰'}
            description={`${kstTime(round.startedAt)} 시작 · ${data.patrollerName}`}
            action={
              <Button size="xs" variant="gray" loading={busy === 'end'} onPress={() => void onEnd()}>
                종료
              </Button>
            }>
            <Stack gap={space.x3}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.x1 }}>
                <Text variant="t10-bold" tabular>
                  {rosterChecked}
                </Text>
                <Text variant="t5-medium" color="neutralSubtle" tabular style={{ paddingBottom: 4 }}>
                  / {data.roster.length}명 점검
                </Text>
              </View>
              <ProgressBar value={data.roster.length ? rosterChecked / data.roster.length : 0} />
              <View style={{ flexDirection: 'row', gap: space.x1_5, flexWrap: 'wrap' }}>
                {(Object.keys(STATUS) as PatrolStatus[]).map((k) => (
                  <Badge key={k} tone={STATUS[k].tone} size="md">
                    {`${STATUS[k].label} ${counts[k]}`}
                  </Badge>
                ))}
              </View>
            </Stack>
          </Section>

          {!CAN_SCAN && (
            <Notice tone="info" icon={ScanLine}>
              QR 스캔은 iOS·Android 앱에서 쓸 수 있어요. 아래 명단에서 학생을 골라 기록해 주세요.
            </Notice>
          )}

          {scanning && (
            <View style={s.scanner}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={handleScan}
              />
              <View pointerEvents="none" style={s.frame} />
              <Text variant="t4-medium" color="staticWhite" align="center" style={s.scanHint}>
                좌석에 붙은 QR을 네모 안에 맞춰 주세요
              </Text>
              <View style={s.stopWrap}>
                <Button size="sm" variant="dark" icon={Square} onPress={() => setScanning(false)}>
                  스캔 멈추기
                </Button>
              </View>
            </View>
          )}

          <Section title="재실 명단" flush>
            <View style={{ paddingHorizontal: space.x4, paddingBottom: space.x2, gap: space.x3 }}>
              <TextField
                value={query}
                onChangeText={setQuery}
                placeholder="이름·학년·좌석으로 찾기"
                prefix={<Search color={color.fg.neutralSubtle} size={18} strokeWidth={2} />}
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel="학생 검색"
              />
              {!query.trim() && (
                <SegmentTabs
                  value={tab}
                  onChange={setTab}
                  tabs={[
                    { value: 'todo', label: '남은 학생', count: data.roster.length - rosterChecked },
                    { value: 'done', label: '점검 완료', count: rosterChecked },
                  ]}
                />
              )}
            </View>
            {list.length === 0 ? (
              <EmptyState
                icon={query.trim() ? Search : UsersRound}
                title={
                  query.trim()
                    ? '찾는 학생이 없어요'
                    : tab === 'todo'
                      ? '재실 학생을 모두 점검했어요'
                      : '아직 점검한 학생이 없어요'
                }
                description={query.trim() ? '검색하면 재원생 전체에서 찾아요' : undefined}
              />
            ) : (
              list.map((st) => {
                const rec = records.get(st.id);
                return (
                  <ListRow
                    key={st.id}
                    onPress={() => setSelected(st)}
                    leading={<SeatTile seat={st.seat} tone={rec ? 'ok' : 'gray'} />}
                    title={st.name}
                    description={
                      rec
                        ? `${st.grade} · ${kstTime(rec.checkedAt)} 점검${rec.note ? ` · ${rec.note}` : ''}`
                        : st.grade
                    }
                    trailing={
                      rec ? <Badge tone={STATUS[rec.status].tone}>{STATUS[rec.status].label}</Badge> : undefined
                    }
                  />
                );
              })
            )}
          </Section>
        </Stack>
      )}

      {round && selected && (
        <RecordSheet
          key={selected.id}
          roundId={round.id}
          student={selected}
          existing={records.get(selected.id) ?? null}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            setSelected(null);
            await refresh();
          }}
        />
      )}
    </Screen>
  );
}

function RecordSheet({
  roundId,
  student,
  existing,
  onClose,
  onSaved,
}: {
  roundId: string;
  student: PatrolStudent;
  existing: { status: PatrolStatus; note: string | null } | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [status, setStatus] = useState<PatrolStatus>(existing?.status ?? 'OK');
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await savePatrolRecord(roundId, { studentId: student.id, status, note: note.trim() });
      toast(`${student.name} 점검을 기록했어요`, 'success');
      await onSaved();
    } catch (e) {
      toast(errorText(e, '점검 기록을 저장하지 못했어요'), 'error');
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={student.name}
      description={`${student.grade} · 좌석 ${student.seat || '미지정'}${existing ? ' · 이미 점검했어요' : ''}`}
      footer={
        <>
          <View style={{ flex: 1 }}>
            <Button variant="gray" block onPress={onClose}>
              취소
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button block loading={saving} onPress={() => void save()}>
              {existing ? '다시 기록' : '기록하기'}
            </Button>
          </View>
        </>
      }>
      <Segmented
        value={status}
        onChange={setStatus}
        options={(Object.keys(STATUS) as PatrolStatus[]).map((k) => ({ value: k, label: STATUS[k].label }))}
      />
      <TextField
        label="관찰 내용"
        indicator={status === 'OK' ? '선택' : undefined}
        value={note}
        onChangeText={setNote}
        multiline
        minHeight={96}
        maxLength={1000}
        placeholder={
          status === 'ABSENT' ? '예: 화장실, 외출 기록 없음' : status === 'NOTE' ? '예: 엎드려 잠, 휴대폰 사용' : '필요하면 적어 주세요'
        }
      />
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  scanner: {
    height: 340,
    borderRadius: radius.r5,
    overflow: 'hidden',
    backgroundColor: color.palette.gray1000,
  },
  frame: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    width: 200,
    height: 200,
    borderRadius: radius.r4,
    borderWidth: 3,
    borderColor: color.palette.staticWhite,
  },
  scanHint: { position: 'absolute', top: 20, left: space.x4, right: space.x4 },
  stopWrap: { position: 'absolute', bottom: space.x4, left: 0, right: 0, alignItems: 'center' },
});
