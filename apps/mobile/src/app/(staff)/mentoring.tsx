import { CalendarCheck, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SectionTitle,
} from '@/components/mobile-ui';
import { FormSheet } from '@/components/form-sheet';
import { FormError, FormInput } from '@/components/workflow-ui';
import { colors, spacing } from '@/constants/theme';
import { formatKoreanDateTime } from '@/lib/format';
import {
  MentoringRecordResponse,
  mutateMobileApi,
  StaffMentoringResponse,
  useMobileQuery,
} from '@/lib/mobile-api';

export default function MentoringScreen() {
  const [selectedSession, setSelectedSession] = useState<
    StaffMentoringResponse['items'][number] | null
  >(null);
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StaffMentoringResponse>('/api/mobile/v1/staff/mentoring');

  return (
    <AppScreen
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="일정 확인과 상담 기록 작성을 처리합니다."
      title="멘토링">
      {data ? (
        <View style={styles.summary}>
          <View>
            <Text style={styles.summaryLabel}>오늘 일정</Text>
            <Text style={styles.summaryValue}>{data.summary.today}건</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryText}>
            <Text style={styles.summaryLabel}>기록 미작성</Text>
            <Text style={[styles.summaryValue, styles.warning]}>
              {data.summary.needsRecord}건
            </Text>
          </View>
          <CalendarCheck color={colors.violet} size={28} />
        </View>
      ) : null}

      <SectionTitle>예정 및 미완료</SectionTitle>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data?.items.length === 0 ? (
        <EmptyState message="예정되었거나 기록이 필요한 멘토링이 없습니다." />
      ) : null}
      <View style={styles.list}>
        {data?.items.map((session) => (
          <Card key={session.id} style={styles.session}>
            <View style={styles.sessionTop}>
              <View style={styles.icon}>
                <UserRound color={colors.violet} size={21} />
              </View>
              <View style={styles.sessionText}>
                <Text style={styles.name}>{session.studentName}</Text>
                <Text style={styles.meta}>
                  {formatKoreanDateTime(session.scheduledAt)} · {session.mode}
                </Text>
                <Text style={styles.mentor}>
                  {session.grade} · 담당 {session.mentorName}
                </Text>
              </View>
              <Badge tone={session.status === '기록 필요' ? 'red' : 'violet'}>
                {session.status}
              </Badge>
            </View>
            <PrimaryButton
              onPress={() => setSelectedSession(session)}
              variant="secondary">
              {session.status === '기록 필요' ? '상담 기록 작성' : '학생 정보 보기'}
            </PrimaryButton>
          </Card>
        ))}
      </View>
      {selectedSession ? (
        <MentoringRecordSheet
          onClose={() => setSelectedSession(null)}
          onCompleted={async () => {
            setSelectedSession(null);
            await refresh();
          }}
          session={selectedSession}
        />
      ) : null}
    </AppScreen>
  );
}

function MentoringRecordSheet({
  onClose,
  onCompleted,
  session,
}: {
  onClose: () => void;
  onCompleted: () => Promise<void>;
  session: StaffMentoringResponse['items'][number];
}) {
  const { data, error, isLoading, retry } = useMobileQuery<MentoringRecordResponse>(
    `/api/mobile/v1/staff/mentoring/${session.id}`,
  );

  return (
    <FormSheet
      onClose={onClose}
      subtitle={`${session.grade} · ${formatKoreanDateTime(session.scheduledAt)}`}
      title={session.studentName}
      visible>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data ? (
        <>
          <View style={styles.studentInfo}>
            <Text style={styles.studentInfoTitle}>학생 정보</Text>
            <Text style={styles.studentInfoText}>
              {data.student.grade}
              {data.student.school ? ` · ${data.student.school}` : ''}
            </Text>
            <Text style={styles.studentInfoNote}>
              {data.student.mentoringNotes || '등록된 멘토링 주의사항이 없습니다.'}
            </Text>
          </View>
          {session.status === '기록 필요' ? (
            <MentoringRecordForm
              initial={data}
              onCompleted={onCompleted}
            />
          ) : (
            <Text style={styles.scheduledNotice}>
              예정된 일정입니다. 상담 시간이 지난 뒤 기록을 작성할 수 있습니다.
            </Text>
          )}
        </>
      ) : null}
    </FormSheet>
  );
}

function MentoringRecordForm({
  initial,
  onCompleted,
}: {
  initial: MentoringRecordResponse;
  onCompleted: () => Promise<void>;
}) {
  const [content, setContent] = useState(initial.content ?? '');
  const [improvements, setImprovements] = useState(initial.improvements ?? '');
  const [weaknesses, setWeaknesses] = useState(initial.weaknesses ?? '');
  const [nextGoals, setNextGoals] = useState(initial.nextGoals ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await mutateMobileApi(
        `/api/mobile/v1/staff/mentoring/${initial.id}`,
        'PATCH',
        { content, improvements, nextGoals, notes, weaknesses },
      );
      await onCompleted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '멘토링 기록을 저장하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <FormInput
        label="상담 내용"
        maxLength={8000}
        multiline
        onChangeText={setContent}
        placeholder="오늘 상담에서 다룬 내용을 입력하세요"
        value={content}
      />
      <FormInput
        label="개선된 점"
        maxLength={4000}
        multiline
        onChangeText={setImprovements}
        placeholder="이전 상담 이후 개선된 점"
        value={improvements}
      />
      <FormInput
        label="부족한 점"
        maxLength={4000}
        multiline
        onChangeText={setWeaknesses}
        placeholder="보완이 필요한 학습 내용"
        value={weaknesses}
      />
      <FormInput
        label="다음 목표"
        maxLength={4000}
        multiline
        onChangeText={setNextGoals}
        placeholder="다음 상담 전까지의 목표"
        value={nextGoals}
      />
      <FormInput
        label="기타 메모"
        maxLength={4000}
        multiline
        onChangeText={setNotes}
        placeholder="운영진에게 공유할 메모"
        value={notes}
      />
      <FormError message={error} />
      <PrimaryButton disabled={submitting} onPress={() => void submit()}>
        {submitting ? '저장 중' : '상담 완료 및 기록 저장'}
      </PrimaryButton>
    </>
  );
}

const styles = StyleSheet.create({
  summary: {
    alignItems: 'center',
    backgroundColor: colors.violetSoft,
    borderRadius: 8,
    flexDirection: 'row',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  summaryText: {
    flex: 1,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  summaryValue: {
    color: colors.violet,
    fontSize: 23,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  warning: {
    color: colors.red,
  },
  summaryDivider: {
    backgroundColor: '#D9D0F2',
    height: 42,
    width: 1,
  },
  list: {
    gap: spacing.md,
  },
  session: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  sessionTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.violetSoft,
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  sessionText: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
  },
  mentor: {
    color: colors.muted,
    fontSize: 11,
  },
  studentInfo: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  studentInfoTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  studentInfoText: {
    color: colors.muted,
    fontSize: 13,
  },
  studentInfoNote: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 20,
  },
  scheduledNotice: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
