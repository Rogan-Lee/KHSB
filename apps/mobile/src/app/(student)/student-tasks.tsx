import type { DocumentPickerAsset } from 'expo-document-picker';
import { FileText, RotateCcw } from 'lucide-react-native';
import { useEffect, useState } from 'react';
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
  MobileTaskSummary,
  StudentTasksResponse,
} from '@/lib/mobile-api';
import { syncTaskDeadlineNotifications } from '@/lib/notifications';

export default function StudentTasksScreen() {
  const [tab, setTab] = useState<'OPEN' | 'DONE'>('OPEN');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StudentTasksResponse>('/api/mobile/v1/student/tasks');
  const items =
    data?.items.filter((item) =>
      tab === 'DONE' ? item.status === 'DONE' : item.status !== 'DONE',
    ) ?? [];

  useEffect(() => {
    if (data) {
      void syncTaskDeadlineNotifications(data.items).catch(() => undefined);
    }
  }, [data]);

  return (
    <AppScreen
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="과제 파일을 제출하고 컨설턴트 피드백을 확인합니다."
      title="수행평가">
      <View style={styles.segmented}>
        <Segment
          active={tab === 'OPEN'}
          label={`진행 중 ${data?.summary.open ?? 0}`}
          onPress={() => setTab('OPEN')}
        />
        <Segment
          active={tab === 'DONE'}
          label={`완료 ${data?.summary.done ?? 0}`}
          onPress={() => setTab('DONE')}
        />
      </View>
      {data && data.summary.needsRevision > 0 ? (
        <View style={styles.revisionNotice}>
          <RotateCcw color={colors.red} size={20} />
          <Text style={styles.revisionText}>
            수정 요청된 수행평가가 {data.summary.needsRevision}건 있습니다.
          </Text>
        </View>
      ) : null}

      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data && items.length === 0 ? (
        <EmptyState
          message={tab === 'DONE' ? '완료된 수행평가가 없습니다.' : '진행 중인 수행평가가 없습니다.'}
        />
      ) : null}
      <View style={styles.list}>
        {items.map((task) => (
          <TaskCard key={task.id} onPress={() => setSelectedId(task.id)} task={task} />
        ))}
      </View>

      {selectedId ? (
        <StudentTaskSheet
          onChanged={async () => {
            await refresh();
          }}
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

function Segment({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.segment, active && styles.activeSegment]}>
      <Text style={[styles.segmentText, active && styles.activeSegmentText]}>{label}</Text>
    </Pressable>
  );
}

function TaskCard({
  onPress,
  task,
}: {
  onPress: () => void;
  task: MobileTaskSummary;
}) {
  const tone =
    task.status === 'NEEDS_REVISION'
      ? 'red'
      : task.status === 'DONE'
        ? 'primary'
        : task.status === 'SUBMITTED'
          ? 'amber'
          : 'blue';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <Card style={styles.taskCard}>
        <View style={styles.taskTop}>
          <View style={styles.badges}>
            <Badge tone="blue">{task.subject}</Badge>
            <Badge tone={tone}>{task.statusLabel}</Badge>
          </View>
          <Text style={styles.due}>{formatDueDate(task.dueDate)}</Text>
        </View>
        <Text style={styles.taskTitle}>{task.title}</Text>
        {task.description ? (
          <Text numberOfLines={2} style={styles.description}>
            {task.description}
          </Text>
        ) : null}
        <View style={styles.taskMeta}>
          <Text style={styles.metaText}>
            {task.format || '형식 미지정'}
            {task.scoreWeight ? ` · ${task.scoreWeight}점` : ''}
          </Text>
          <Text style={styles.metaText}>제출 {task.submissionCount}회</Text>
        </View>
      </Card>
    </Pressable>
  );
}

function StudentTaskSheet({
  onChanged,
  onClose,
  taskId,
}: {
  onChanged: () => Promise<void>;
  onClose: () => void;
  taskId: string;
}) {
  const { data, error, isLoading, refresh, retry } = useMobileQuery<MobileTaskDetail>(
    `/api/mobile/v1/student/tasks/${taskId}`,
  );

  return (
    <FormSheet
      onClose={onClose}
      subtitle={data ? `${data.subject} · ${formatDueDate(data.dueDate)}` : undefined}
      title={data?.title ?? '수행평가 상세'}
      visible>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data ? (
        <>
          <TaskDetailHeader task={data} />
          {data.status !== 'DONE' ? (
            <SubmissionForm
              onSubmitted={async () => {
                await Promise.all([refresh(), onChanged()]);
              }}
              task={data}
            />
          ) : null}
          <SubmissionHistory submissions={data.submissions} />
        </>
      ) : null}
    </FormSheet>
  );
}

function TaskDetailHeader({ task }: { task: MobileTaskDetail }) {
  return (
    <Card style={styles.detailCard}>
      <View style={styles.badges}>
        <Badge tone="blue">{task.subject}</Badge>
        <Badge tone={task.status === 'NEEDS_REVISION' ? 'red' : 'primary'}>
          {task.statusLabel}
        </Badge>
      </View>
      {task.description ? <Text style={styles.detailText}>{task.description}</Text> : null}
      <Text style={styles.metaText}>
        {task.format || '형식 미지정'}
        {task.scoreWeight ? ` · ${task.scoreWeight}점` : ''} · 마감{' '}
        {new Date(task.dueDate).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
      </Text>
    </Card>
  );
}

function SubmissionForm({
  onSubmitted,
  task,
}: {
  onSubmitted: () => Promise<void>;
  task: MobileTaskDetail;
}) {
  const [assets, setAssets] = useState<DocumentPickerAsset[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (assets.length === 0) {
      setError('최소 1개 이상의 파일을 선택하세요.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const files = await Promise.all(
        assets.map((asset) =>
          uploadMobileTaskFile(asset, { context: 'task', taskId: task.id }),
        ),
      );
      await mutateMobileApi(
        `/api/mobile/v1/student/tasks/${task.id}/submissions`,
        'POST',
        { files, note },
      );
      setAssets([]);
      setNote('');
      await onSubmitted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '수행평가를 제출하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SectionTitle>
        {task.status === 'NEEDS_REVISION' ? '수정본 제출' : '과제 제출'}
      </SectionTitle>
      <TaskFilePicker assets={assets} onChange={setAssets} />
      <FormInput
        label="전달 메모"
        maxLength={2000}
        multiline
        onChangeText={setNote}
        placeholder="컨설턴트에게 전달할 내용을 입력하세요"
        value={note}
      />
      <FormError message={error} />
      <PrimaryButton disabled={submitting} onPress={() => void submit()}>
        {submitting ? '업로드 및 제출 중' : task.submissions.length > 0 ? '재제출' : '제출하기'}
      </PrimaryButton>
    </>
  );
}

function SubmissionHistory({
  submissions,
}: {
  submissions: MobileTaskDetail['submissions'];
}) {
  if (submissions.length === 0) return null;
  return (
    <>
      <SectionTitle>제출 및 피드백</SectionTitle>
      <View style={styles.history}>
        {submissions.map((submission) => (
          <Card key={submission.id} style={styles.submissionCard}>
            <View style={styles.submissionHeader}>
              <Badge tone="amber">v{submission.version}</Badge>
              <Text style={styles.metaText}>{formatShortDateTime(submission.submittedAt)}</Text>
            </View>
            <FileLinks files={submission.files} />
            {submission.note ? <Text style={styles.note}>{submission.note}</Text> : null}
            {submission.feedbacks.map((feedback) => (
              <View key={feedback.id} style={styles.feedback}>
                <View style={styles.submissionHeader}>
                  <Badge tone={feedback.status === 'NEEDS_REVISION' ? 'red' : 'primary'}>
                    {feedback.status === 'APPROVED'
                      ? '승인'
                      : feedback.status === 'NEEDS_REVISION'
                        ? '수정 요청'
                        : '코멘트'}
                  </Badge>
                  <Text style={styles.metaText}>
                    {feedback.authorName} · {formatShortDateTime(feedback.createdAt)}
                  </Text>
                </View>
                <Text style={styles.feedbackText}>{feedback.content}</Text>
                <FileLinks files={feedback.files} />
              </View>
            ))}
          </Card>
        ))}
      </View>
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
  segmented: {
    backgroundColor: '#E9EFEC',
    borderRadius: 8,
    flexDirection: 'row',
    padding: 3,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  activeSegment: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  activeSegmentText: {
    color: colors.ink,
  },
  revisionNotice: {
    alignItems: 'center',
    backgroundColor: colors.redSoft,
    borderRadius: 8,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  revisionText: {
    color: colors.red,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
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
  description: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  taskMeta: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
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
  history: {
    gap: spacing.md,
  },
  submissionCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  submissionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  pressed: {
    opacity: 0.72,
  },
});
