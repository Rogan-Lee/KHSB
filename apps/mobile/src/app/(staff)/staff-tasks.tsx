import type { DocumentPickerAsset } from 'expo-document-picker';
import { FileText, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { FormSheet } from '@/components/form-sheet';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SectionTitle,
} from '@/components/mobile-ui';
import { TaskFilePicker } from '@/components/task-file-picker';
import { FormError, FormInput } from '@/components/workflow-ui';
import { colors, spacing } from '@/constants/theme';
import { formatDueDate, formatShortDateTime } from '@/lib/format';
import {
  mutateMobileApi,
  uploadMobileTaskFile,
  useMobileQuery,
} from '@/lib/mobile-api';
import type {
  MobileTaskDetail,
  MobileTaskFile,
  StaffTasksResponse,
} from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

const FEEDBACK_OPTIONS = [
  { label: '코멘트', value: 'COMMENT' },
  { label: '수정 요청', value: 'NEEDS_REVISION' },
  { label: '승인', value: 'APPROVED' },
] as const;

export default function StaffTasksScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { session } = useSession();
  const canWriteFeedback = ['SUPER_ADMIN', 'DIRECTOR', 'CONSULTANT'].includes(
    session?.staffRole ?? '',
  );
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StaffTasksResponse>('/api/mobile/v1/staff/tasks');

  return (
    <AppScreen
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="학생 제출물을 검토하고 피드백 상태를 처리합니다."
      title="수행평가 관리">
      {data ? (
        <View style={styles.summary}>
          <Summary label="피드백 대기" tone="blue" value={data.summary.needsFeedback} />
          <Summary label="수정 요청" tone="red" value={data.summary.needsRevision} />
          <Summary label="완료" tone="primary" value={data.summary.done} />
        </View>
      ) : null}
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data?.items.length === 0 ? (
        <EmptyState message="아직 제출된 수행평가가 없습니다." />
      ) : null}
      <View style={styles.list}>
        {data?.items.map((task) => (
          <Pressable
            accessibilityRole="button"
            key={task.id}
            onPress={() => setSelectedId(task.id)}
            style={({ pressed }) => pressed && styles.pressed}>
            <Card style={styles.taskCard}>
              <View style={styles.taskTop}>
                <View style={styles.badges}>
                  <Badge tone="blue">{task.subject}</Badge>
                  <Badge
                    tone={
                      task.status === 'NEEDS_REVISION'
                        ? 'red'
                        : task.status === 'DONE'
                          ? 'primary'
                          : 'amber'
                    }>
                    {task.statusLabel}
                  </Badge>
                </View>
                <Text style={styles.due}>{formatDueDate(task.dueDate)}</Text>
              </View>
              <Text style={styles.taskTitle}>{task.title}</Text>
              <View style={styles.studentRow}>
                <UserRound color={colors.violet} size={18} />
                <Text style={styles.studentName}>
                  {task.student.name} · {task.student.grade}
                </Text>
              </View>
              {task.latestSubmission ? (
                <Text style={styles.metaText}>
                  v{task.latestSubmission.version} ·{' '}
                  {formatShortDateTime(task.latestSubmission.submittedAt)} · 피드백{' '}
                  {task.latestSubmission.feedbackCount}건
                </Text>
              ) : null}
            </Card>
          </Pressable>
        ))}
      </View>

      {selectedId ? (
        <StaffTaskSheet
          canWriteFeedback={canWriteFeedback}
          onChanged={refresh}
          onClose={() => {
            setSelectedId(null);
            void refresh();
          }}
          taskId={selectedId}
        />
      ) : null}
    </AppScreen>
  );
}

function Summary({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'blue' | 'primary' | 'red';
  value: number;
}) {
  const color = tone === 'red' ? colors.red : tone === 'blue' ? colors.blue : colors.primary;
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function StaffTaskSheet({
  canWriteFeedback,
  onChanged,
  onClose,
  taskId,
}: {
  canWriteFeedback: boolean;
  onChanged: () => Promise<void>;
  onClose: () => void;
  taskId: string;
}) {
  const { data, error, isLoading, refresh, retry } = useMobileQuery<MobileTaskDetail>(
    `/api/mobile/v1/staff/tasks/${taskId}`,
  );
  const latest = data?.submissions[0] ?? null;

  return (
    <FormSheet
      onClose={onClose}
      subtitle={
        data?.student
          ? `${data.student.name} · ${data.student.grade}${data.student.school ? ` · ${data.student.school}` : ''}`
          : undefined
      }
      title={data?.title ?? '수행평가 검토'}
      visible>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data ? (
        <>
          <Card style={styles.detailCard}>
            <View style={styles.badges}>
              <Badge tone="blue">{data.subject}</Badge>
              <Badge tone={data.status === 'NEEDS_REVISION' ? 'red' : 'primary'}>
                {data.statusLabel}
              </Badge>
            </View>
            {data.description ? <Text style={styles.detailText}>{data.description}</Text> : null}
            <Text style={styles.metaText}>
              {data.format || '형식 미지정'} · 마감{' '}
              {new Date(data.dueDate).toLocaleDateString('ko-KR', {
                timeZone: 'Asia/Seoul',
              })}
            </Text>
          </Card>
          <SectionTitle>제출 내역</SectionTitle>
          <View style={styles.list}>
            {data.submissions.map((submission) => (
              <Card key={submission.id} style={styles.submissionCard}>
                <View style={styles.taskTop}>
                  <Badge tone="amber">v{submission.version}</Badge>
                  <Text style={styles.metaText}>
                    {formatShortDateTime(submission.submittedAt)}
                  </Text>
                </View>
                <FileLinks files={submission.files} />
                {submission.note ? <Text style={styles.note}>{submission.note}</Text> : null}
                {submission.feedbacks.map((feedback) => (
                  <View key={feedback.id} style={styles.feedback}>
                    <View style={styles.taskTop}>
                      <Badge
                        tone={feedback.status === 'NEEDS_REVISION' ? 'red' : 'primary'}>
                        {feedback.status === 'APPROVED'
                          ? '승인'
                          : feedback.status === 'NEEDS_REVISION'
                            ? '수정 요청'
                            : '코멘트'}
                      </Badge>
                      <Text style={styles.metaText}>{feedback.authorName}</Text>
                    </View>
                    <Text style={styles.feedbackText}>{feedback.content}</Text>
                    <FileLinks files={feedback.files} />
                  </View>
                ))}
              </Card>
            ))}
          </View>
          {latest && data.status !== 'DONE' && canWriteFeedback ? (
            <FeedbackForm
              onSubmitted={async () => {
                await Promise.all([refresh(), onChanged()]);
              }}
              submissionId={latest.id}
            />
          ) : null}
        </>
      ) : null}
    </FormSheet>
  );
}

function FeedbackForm({
  onSubmitted,
  submissionId,
}: {
  onSubmitted: () => Promise<void>;
  submissionId: string;
}) {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'COMMENT' | 'NEEDS_REVISION' | 'APPROVED'>(
    'COMMENT',
  );
  const [assets, setAssets] = useState<DocumentPickerAsset[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      const files = await Promise.all(
        assets.map((asset) =>
          uploadMobileTaskFile(asset, {
            context: 'feedback',
            submissionId,
          }),
        ),
      );
      await mutateMobileApi(
        `/api/mobile/v1/staff/tasks/submissions/${submissionId}/feedback`,
        'POST',
        { content, files, status },
      );
      setContent('');
      setAssets([]);
      await onSubmitted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '피드백을 저장하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SectionTitle>피드백 작성</SectionTitle>
      <View style={styles.feedbackStatus}>
        {FEEDBACK_OPTIONS.map((option) => (
          <Pressable
            accessibilityRole="button"
            key={option.value}
            onPress={() => setStatus(option.value)}
            style={[
              styles.feedbackOption,
              status === option.value && styles.activeFeedbackOption,
            ]}>
            <Text
              style={[
                styles.feedbackOptionText,
                status === option.value && styles.activeFeedbackOptionText,
              ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <FormInput
        label="피드백 내용"
        maxLength={4000}
        multiline
        onChangeText={setContent}
        placeholder="학생에게 전달할 피드백을 입력하세요"
        value={content}
      />
      <TaskFilePicker assets={assets} onChange={setAssets} />
      <FormError message={error} />
      <PrimaryButton disabled={submitting} onPress={() => void submit()}>
        {submitting ? '저장 중' : '피드백 저장'}
      </PrimaryButton>
    </>
  );
}

function FileLinks({ files }: { files: MobileTaskFile[] }) {
  return (
    <View style={styles.files}>
      {files.map((file) => (
        <Pressable
          accessibilityRole="link"
          key={file.url}
          onPress={() => void Linking.openURL(file.url)}
          style={({ pressed }) => [styles.fileLink, pressed && styles.pressed]}>
          <FileText color={colors.blue} size={16} />
          <Text numberOfLines={1} style={styles.fileName}>
            {file.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryItem: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    minHeight: 82,
    justifyContent: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 11,
  },
  list: {
    gap: spacing.md,
  },
  taskCard: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  taskTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  due: {
    color: colors.red,
    fontSize: 12,
    fontWeight: '800',
  },
  taskTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  studentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  studentName: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  metaText: {
    color: colors.muted,
    fontSize: 11,
  },
  detailCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  detailText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 22,
  },
  submissionCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  files: {
    gap: spacing.sm,
  },
  fileLink: {
    alignItems: 'center',
    backgroundColor: colors.blueSoft,
    borderRadius: 8,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  fileName: {
    color: colors.blue,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  note: {
    backgroundColor: colors.canvas,
    borderRadius: 8,
    color: colors.ink,
    fontSize: 12,
    lineHeight: 18,
    padding: spacing.md,
  },
  feedback: {
    backgroundColor: colors.canvas,
    borderRadius: 8,
    gap: spacing.sm,
    padding: spacing.md,
  },
  feedbackText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 20,
  },
  feedbackStatus: {
    backgroundColor: '#E9EFEC',
    borderRadius: 8,
    flexDirection: 'row',
    padding: 3,
  },
  feedbackOption: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  activeFeedbackOption: {
    backgroundColor: colors.primary,
  },
  feedbackOptionText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  activeFeedbackOptionText: {
    color: colors.surface,
  },
  pressed: {
    opacity: 0.72,
  },
});
