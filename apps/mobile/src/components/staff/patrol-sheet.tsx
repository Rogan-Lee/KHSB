import {
  BarcodeScanningResult,
  CameraView,
  useCameraPermissions,
} from 'expo-camera';
import {
  CheckCircle2,
  CircleAlert,
  MapPin,
  ScanLine,
  Square,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FormSheet } from '@/components/form-sheet';
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SectionTitle,
} from '@/components/mobile-ui';
import { FormError, FormInput } from '@/components/workflow-ui';
import { colors, spacing } from '@/constants/theme';
import { formatShortDateTime } from '@/lib/format';
import {
  mutateMobileApi,
  PatrolStudent,
  StaffPatrolResponse,
  useMobileQuery,
} from '@/lib/mobile-api';
import { decodeStudentQr } from '@/lib/patrol';

const STATUS_OPTIONS = [
  { label: '양호', value: 'OK' },
  { label: '특이사항', value: 'NOTE' },
  { label: '자리 비움', value: 'ABSENT' },
] as const;

export function PatrolSheet({
  onChanged,
  onClose,
}: {
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<PatrolStudent | null>(null);
  const [status, setStatus] = useState<'OK' | 'NOTE' | 'ABSENT'>('OK');
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { data, error, isLoading, refresh, retry } =
    useMobileQuery<StaffPatrolResponse>('/api/mobile/v1/staff/patrol');

  const checkedIds = useMemo(
    () => new Set(data?.records.map((record) => record.studentId) ?? []),
    [data?.records],
  );
  const filteredRoster = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!data) return [];
    const source = normalized ? data.allStudents : data.roster;
    if (!normalized) return source;
    return source.filter((student) =>
      `${student.name} ${student.grade} ${student.seat ?? ''}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [data, query]);

  function selectStudent(student: PatrolStudent) {
    const existing = data?.records.find((record) => record.studentId === student.id);
    setSelected(student);
    setStatus(existing?.status ?? 'OK');
    setNote(existing?.note ?? '');
    setScanning(false);
    setSubmitError('');
  }

  function handleScan(result: BarcodeScanningResult) {
    if (!data) return;
    const studentId = decodeStudentQr(result.data);
    if (!studentId) {
      setSubmitError('스터디룸 좌석 QR 코드가 아닙니다.');
      return;
    }
    const student = data.allStudents.find((item) => item.id === studentId);
    if (!student) {
      setSubmitError('재원 중인 학생을 찾을 수 없습니다.');
      return;
    }
    selectStudent(student);
  }

  async function openScanner() {
    setSubmitError('');
    if (Platform.OS === 'web') {
      setSubmitError('QR 스캔은 iOS 또는 Android 앱에서 사용할 수 있습니다.');
      return;
    }
    if (!permission?.granted) {
      const nextPermission = await requestPermission();
      if (!nextPermission.granted) {
        setSubmitError('QR 스캔을 위해 카메라 권한을 허용하세요.');
        return;
      }
    }
    setScanning(true);
  }

  async function startRound() {
    setSubmitting(true);
    setSubmitError('');
    try {
      await mutateMobileApi('/api/mobile/v1/staff/patrol', 'POST', {
        action: 'START',
      });
      await Promise.all([refresh(), onChanged()]);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : '순찰을 시작하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  function requestEndRound() {
    if (!data?.activeRound) return;
    Alert.alert('순찰 종료', '현재 순찰 회차를 종료할까요?', [
      { style: 'cancel', text: '취소' },
      {
        onPress: () => void endRound(data.activeRound!.id),
        style: 'destructive',
        text: '종료',
      },
    ]);
  }

  async function endRound(roundId: string) {
    setSubmitting(true);
    setSubmitError('');
    try {
      await mutateMobileApi('/api/mobile/v1/staff/patrol', 'POST', {
        action: 'END',
        roundId,
      });
      setSelected(null);
      setScanning(false);
      await Promise.all([refresh(), onChanged()]);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : '순찰을 종료하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveRecord() {
    if (!data?.activeRound || !selected) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await mutateMobileApi(
        `/api/mobile/v1/staff/patrol/${data.activeRound.id}/records`,
        'POST',
        {
          note,
          status,
          studentId: selected.id,
        },
      );
      setSelected(null);
      setNote('');
      setStatus('OK');
      await Promise.all([refresh(), onChanged()]);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : '순찰 기록을 저장하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormSheet
      onClose={onClose}
      subtitle="좌석 QR을 스캔하거나 재실 명단에서 학생을 선택합니다."
      title="순찰 QR"
      visible>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}

      {data?.activeRound ? (
        <View style={styles.roundSummary}>
          <View style={styles.roundText}>
            <Text style={styles.roundTitle}>
              {data.activeRound.label || '진행 중인 순찰'}
            </Text>
            <Text style={styles.roundCaption}>
              {formatShortDateTime(data.activeRound.startedAt)} · {data.patrollerName}
            </Text>
          </View>
          <Text style={styles.progress}>
            {data.records.length}/{data.roster.length}
          </Text>
        </View>
      ) : data ? (
        <Card style={styles.emptyRound}>
          <ScanLine color={colors.violet} size={28} />
          <Text style={styles.emptyRoundTitle}>진행 중인 순찰이 없습니다.</Text>
          <Text style={styles.emptyRoundText}>
            회차를 시작하면 재실 학생의 좌석 QR을 기록할 수 있습니다.
          </Text>
          <PrimaryButton disabled={submitting} onPress={() => void startRound()}>
            순찰 시작
          </PrimaryButton>
        </Card>
      ) : null}

      {data?.activeRound ? (
        <>
          <View style={styles.roundActions}>
            <PrimaryButton onPress={() => void openScanner()}>QR 스캔</PrimaryButton>
            <PrimaryButton
              disabled={submitting}
              onPress={requestEndRound}
              variant="danger">
              회차 종료
            </PrimaryButton>
          </View>

          {scanning ? (
            <View style={styles.scanner}>
              <CameraView
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                facing="back"
                onBarcodeScanned={handleScan}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="none" style={styles.scanFrame} />
              <Pressable
                accessibilityRole="button"
                onPress={() => setScanning(false)}
                style={styles.stopScan}>
                <Square color={colors.surface} fill={colors.surface} size={14} />
                <Text style={styles.stopScanText}>스캔 중지</Text>
              </Pressable>
            </View>
          ) : null}

          {selected ? (
            <Card style={styles.recordCard}>
              <View style={styles.selectedTop}>
                <View style={styles.seatIcon}>
                  <MapPin color={colors.violet} size={20} />
                </View>
                <View style={styles.selectedText}>
                  <Text style={styles.selectedName}>{selected.name}</Text>
                  <Text style={styles.selectedMeta}>
                    {selected.grade} · 좌석 {selected.seat || '미지정'}
                  </Text>
                </View>
              </View>
              <View style={styles.segmented}>
                {STATUS_OPTIONS.map((option) => (
                  <Pressable
                    accessibilityRole="button"
                    key={option.value}
                    onPress={() => setStatus(option.value)}
                    style={[styles.segment, status === option.value && styles.activeSegment]}>
                    <Text
                      style={[
                        styles.segmentText,
                        status === option.value && styles.activeSegmentText,
                      ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <FormInput
                label="특이사항"
                maxLength={1000}
                multiline
                onChangeText={setNote}
                placeholder="필요한 경우 관찰 내용을 입력하세요"
                value={note}
              />
              <PrimaryButton disabled={submitting} onPress={() => void saveRecord()}>
                {submitting ? '저장 중' : '점검 기록 저장'}
              </PrimaryButton>
            </Card>
          ) : null}

          <FormError message={submitError} />
          <SectionTitle>재실 명단</SectionTitle>
          <FormInput
            label="학생 검색"
            onChangeText={setQuery}
            placeholder="이름, 학년, 좌석"
            value={query}
          />
          {filteredRoster.length === 0 ? (
            <EmptyState message="조건에 맞는 학생이 없습니다." />
          ) : (
            <View style={styles.roster}>
              {filteredRoster.map((student) => {
                const checked = checkedIds.has(student.id);
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={student.id}
                    onPress={() => selectStudent(student)}
                    style={({ pressed }) => [
                      styles.studentRow,
                      pressed && styles.pressed,
                    ]}>
                    <View style={styles.studentMain}>
                      <Text style={styles.studentName}>{student.name}</Text>
                      <Text style={styles.studentMeta}>
                        {student.grade} · {student.seat || '좌석 미지정'}
                      </Text>
                    </View>
                    {checked ? (
                      <CheckCircle2 color={colors.primary} size={20} />
                    ) : (
                      <CircleAlert color={colors.muted} size={20} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      ) : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  roundSummary: {
    alignItems: 'center',
    backgroundColor: colors.violetSoft,
    borderRadius: 8,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  roundText: {
    flex: 1,
    gap: spacing.xs,
  },
  roundTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  roundCaption: {
    color: colors.muted,
    fontSize: 11,
  },
  progress: {
    color: colors.violet,
    fontSize: 26,
    fontWeight: '900',
  },
  emptyRound: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyRoundTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyRoundText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  roundActions: {
    gap: spacing.sm,
  },
  scanner: {
    backgroundColor: colors.ink,
    borderRadius: 8,
    height: 300,
    overflow: 'hidden',
    position: 'relative',
  },
  scanFrame: {
    borderColor: colors.surface,
    borderRadius: 8,
    borderWidth: 2,
    height: 190,
    left: '18%',
    position: 'absolute',
    top: 48,
    width: '64%',
  },
  stopScan: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(23, 33, 29, 0.82)',
    borderRadius: 8,
    bottom: 16,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
  },
  stopScanText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '800',
  },
  recordCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  selectedTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  seatIcon: {
    alignItems: 'center',
    backgroundColor: colors.violetSoft,
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  selectedText: {
    flex: 1,
    gap: 3,
  },
  selectedName: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  selectedMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  segmented: {
    backgroundColor: colors.canvas,
    borderRadius: 8,
    flexDirection: 'row',
    padding: 3,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.xs,
  },
  activeSegment: {
    backgroundColor: colors.violet,
  },
  segmentText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  activeSegmentText: {
    color: colors.surface,
  },
  roster: {
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  studentRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 62,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  studentMain: {
    flex: 1,
    gap: 3,
  },
  studentName: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  studentMeta: {
    color: colors.muted,
    fontSize: 11,
  },
  pressed: {
    opacity: 0.72,
  },
});
