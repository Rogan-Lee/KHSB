import type { DocumentPickerAsset } from 'expo-document-picker';
import { FileText } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { FormSheet } from '@/components/form-sheet';
import {
  Badge,
  Banner,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SectionTitle,
  Segmented,
} from '@/components/mobile-ui';
import { TaskFilePicker } from '@/components/task-file-picker';
import { FormError, FormInput } from '@/components/workflow-ui';
import { colors, palette, radius, spacing, Tone, type } from '@/constants/theme';
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

type Filter = 'OPEN' | 'DONE' | 'ALL';

function statusBadge(task: { status: string; statusLabel: string; dueDate: string }): {
  tone: Tone;
  text: string;
} {
  switch (task.status) {
    case 'NEEDS_REVISION':
      return { tone: 'violet', text: '수정 요청' };
    case 'DONE':
      return { tone: 'positive', text: '확정' };
    case 'SUBMITTED':
      return { tone: 'blue', text: '제출 완료' };
    default:
      return { tone: 'warning', text: `제출 ${formatDueDate(task.dueDate)}` };
  }
}

export default function StudentTasksScreen() {
  const [tab, setTab] = useState<Filter>('OPEN');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StudentTasksResponse>('/api/mobile/v1/student/tasks');
  const items =
    data?.items.filter((item) =>
      tab === 'ALL' ? true : tab === 'DONE' ? item.status === 'DONE' : item.status !== 'DONE',
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
      title="과제·수행평가">
      <Segmented
        options={[
          { label: '진행 중', value: 'OPEN' },
          { label: '완료', value: 'DONE' },
          { label: '전체', value: 'ALL' },
        ]}
        value={tab}
        onChange={(v) => setTab(v as Filter)}
      />

      {data && data.summary.needsRevision > 0 ? (
        <Banner
          text={`수정 요청된 수행평가 ${data.summary.needsRevision}건`}
          right="확인"
          tone="violet"
        />
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

      {items.length > 0 ? (
        <View style={styles.flow}>
          <Text style={styles.flowText}>상태 흐름: 제출 → 피드백 → 수정요청 → 확정</Text>
        </View>
      ) : null}

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

function TaskCard({ onPress, task }: { onPress: () => void; task: MobileTaskSummary }) {
  const badge = statusBadge(task);
  const showSubmit = task.status === 'OPEN' || task.status === 'NEEDS_REVISION';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <Card>
        <View style={styles.taskTop}>
          <Text style={styles.taskTitle} numberOfLines={1}>
            {task.title}
          </Text>
          <Badge tone={badge.tone}>{badge.text}</Badge>
        </View>
        <Text style={styles.caption} numberOfLines={2}>
          {task.subject}
          {task.format ? ` · ${task.format}` : ''}
          {task.scoreWeight ? ` · ${task.scoreWeight}점` : ''}
          {task.submissionCount ? ` · 제출 ${task.submissionCount}회` : ''}
        </Text>
        {showSubmit ? (
          <View style={{ marginTop: spacing.md }}>
            <PrimaryButton onPress={onPress} size="md">
              {task.status === 'NEEDS_REVISION' ? '수정본 제출하기' : '파일 제출하기'}
            </PrimaryButton>
          </View>
        ) : null}
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
  const badge = statusBadge(task);
  return (
    <Card>
      <View style={styles.badges}>
        <Badge tone="neutral">{task.subject}</Badge>
        <Badge tone={badge.tone}>{badge.text}</Badge>
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
          <Card key={submission.id}>
            <View style={styles.submissionHeader}>
              <Badge tone="neutral">v{submission.version}</Badge>
              <Text style={styles.metaText}>{formatShortDateTime(submission.submittedAt)}</Text>
            </View>
            <FileLinks files={submission.files} />
            {submission.note ? <Text style={styles.note}>{submission.note}</Text> : null}
            {submission.feedbacks.map((feedback) => (
              <View key={feedback.id} style={styles.feedback}>
                <View style={styles.submissionHeader}>
                  <Badge tone={feedback.status === 'NEEDS_REVISION' ? 'violet' : 'positive'}>
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
          <FileText color={palette.blue50} size={16} />
          <Text numberOfLines={1} style={styles.fileName}>
            {file.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  taskTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  taskTitle: { ...type.label1, color: colors.textNormal, flex: 1 },
  caption: { ...type.caption1, color: colors.textAssistive, marginTop: 6 },

  flow: {
    backgroundColor: colors.fillAlt,
    borderRadius: radius.lg,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  flowText: { ...type.caption2, color: colors.textAssistive },

  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  detailText: { ...type.body3, color: colors.textNormal, marginTop: spacing.sm, lineHeight: 22 },
  metaText: { ...type.caption2, color: colors.textAssistive },
  history: { gap: spacing.md },
  submissionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  files: { gap: spacing.sm, marginTop: spacing.sm },
  fileLink: {
    alignItems: 'center',
    backgroundColor: palette.blue5,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  fileName: { ...type.caption1, color: palette.blue50, flex: 1, fontWeight: '700' },
  note: {
    backgroundColor: colors.bgSunken,
    borderRadius: radius.lg,
    color: colors.textNormal,
    ...type.caption1,
    lineHeight: 18,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  feedback: {
    backgroundColor: colors.bgSunken,
    borderRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  feedbackText: { ...type.body3, color: colors.textNormal, lineHeight: 20 },
  pressed: { opacity: 0.72 },
});
