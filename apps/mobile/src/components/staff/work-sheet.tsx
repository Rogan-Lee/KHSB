import { Clock3, LogIn, LogOut } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FormSheet } from '@/components/form-sheet';
import { Card, PrimaryButton, SectionTitle } from '@/components/mobile-ui';
import { FormError, FormInput } from '@/components/workflow-ui';
import { colors, spacing } from '@/constants/theme';
import {
  formatCurrency,
  formatKoreanDateTime,
  formatMinutes,
} from '@/lib/format';
import {
  mutateMobileApi,
  StaffOperationsResponse,
  WorkTagView,
} from '@/lib/mobile-api';

export function WorkSheet({
  data,
  onChanged,
  onClose,
}: {
  data: StaffOperationsResponse;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const nextAction = data.clock.isWorking ? 'CLOCK_OUT' : 'CLOCK_IN';

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await mutateMobileApi('/api/mobile/v1/staff/operations', 'POST', {
        action: nextAction,
        note,
      });
      setNote('');
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '근무 기록을 저장하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormSheet
      onClose={onClose}
      subtitle={`${data.month.year}년 ${data.month.month}월 본인 근무 내역`}
      title="근무 기록"
      visible>
      <View style={[styles.status, data.clock.isWorking && styles.workingStatus]}>
        {data.clock.isWorking ? (
          <LogIn color={colors.primary} size={24} />
        ) : (
          <Clock3 color={colors.muted} size={24} />
        )}
        <View style={styles.statusText}>
          <Text style={styles.statusTitle}>
            {data.clock.isWorking ? '현재 근무 중' : '현재 퇴근 상태'}
          </Text>
          <Text style={styles.statusCaption}>
            {data.clock.lastTag
              ? `${data.clock.lastTag.type === 'CLOCK_IN' ? '출근' : '퇴근'} · ${formatKoreanDateTime(data.clock.lastTag.taggedAt)}`
              : '등록된 출퇴근 기록이 없습니다.'}
          </Text>
        </View>
      </View>

      <FormInput
        label="메모"
        maxLength={500}
        onChangeText={setNote}
        placeholder="교대나 특이사항이 있으면 입력하세요"
        value={note}
      />
      <FormError message={error} />
      <PrimaryButton
        disabled={submitting}
        onPress={() => void submit()}
        variant={data.clock.isWorking ? 'danger' : 'primary'}>
        {submitting
          ? '저장 중'
          : data.clock.isWorking
            ? '퇴근 기록'
            : '출근 기록'}
      </PrimaryButton>

      <SectionTitle>이번 달 정산</SectionTitle>
      <Card style={styles.monthCard}>
        <Metric label="입력된 근무 시간" value={formatMinutes(data.month.totalMinutes)} />
        <View style={styles.divider} />
        <Metric label="예상 세전 금액" value={formatCurrency(data.month.totalWage)} />
        <Text style={styles.confirmation}>
          {data.month.ownerConfirmedAt
            ? '원장 확인 완료'
            : data.month.staffConfirmedAt
              ? '본인 확인 완료 · 원장 확인 대기'
              : '확인 전'}
        </Text>
      </Card>

      <SectionTitle>최근 출퇴근</SectionTitle>
      <View style={styles.list}>
        {data.clock.recentTags.map((tag) => (
          <WorkTagRow key={tag.id} tag={tag} />
        ))}
        {data.clock.recentTags.length === 0 ? (
          <Text style={styles.empty}>최근 출퇴근 기록이 없습니다.</Text>
        ) : null}
      </View>
    </FormSheet>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function WorkTagRow({ tag }: { tag: WorkTagView }) {
  const isClockIn = tag.type === 'CLOCK_IN';
  return (
    <Card style={styles.tagRow}>
      <View style={[styles.icon, !isClockIn && styles.outIcon]}>
        {isClockIn ? (
          <LogIn color={colors.primary} size={18} />
        ) : (
          <LogOut color={colors.red} size={18} />
        )}
      </View>
      <View style={styles.tagText}>
        <Text style={styles.tagTitle}>{isClockIn ? '출근' : '퇴근'}</Text>
        <Text style={styles.tagTime}>{formatKoreanDateTime(tag.taggedAt)}</Text>
        {tag.note ? <Text style={styles.tagNote}>{tag.note}</Text> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  status: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  workingStatus: {
    backgroundColor: colors.primarySoft,
    borderColor: '#B7D8CA',
  },
  statusText: {
    flex: 1,
    gap: spacing.xs,
  },
  statusTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  statusCaption: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  monthCard: {
    padding: spacing.lg,
  },
  metric: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 42,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 13,
  },
  metricValue: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  divider: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth,
  },
  confirmation: {
    color: colors.primary,
    fontSize: 11,
    marginTop: spacing.sm,
    textAlign: 'right',
  },
  list: {
    gap: spacing.sm,
  },
  tagRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  outIcon: {
    backgroundColor: colors.redSoft,
  },
  tagText: {
    flex: 1,
    gap: 2,
  },
  tagTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  tagTime: {
    color: colors.muted,
    fontSize: 11,
  },
  tagNote: {
    color: colors.ink,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  empty: {
    color: colors.muted,
    fontSize: 13,
    paddingVertical: spacing.xl,
    textAlign: 'center',
  },
});
