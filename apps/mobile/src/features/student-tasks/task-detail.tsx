import type { DocumentPickerAsset } from 'expo-document-picker';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { CheckCircle2, CircleAlert } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  confirm,
  ErrorState,
  GroupLabel,
  IconTile,
  InfoRow,
  Notice,
  Screen,
  Section,
  Skeleton,
  space,
  Stack,
  Text,
  TextField,
  toast,
} from '@/design';
import { TaskFilePicker } from '@/components/task-file-picker';
import {
  studentTaskPath,
  submitStudentTask,
  type MobileTaskDetail,
  type MobileTaskFile,
} from '@/lib/api/student-learning';
import { refreshBadges } from '@/lib/badges';
import { uploadMobileTaskFile, useMobileQuery } from '@/lib/mobile-api';

import { dueInfo, formatDateTimeKST, formatMonthDayWeekday, TASK_STATUS } from './status';
import { SubmissionThread } from './submission-thread';

const TASKS_TAB = '/(student)/(tabs)/tasks';

/**
 * 과제 상세 — 웹 포털 /s/[token]/tasks/[taskId] 와 같은 구성.
 *  제목 카드 → 정보(상태·마감일·최근 제출) → 제출 폼(하단 고정 "제출하기") 또는 최종 완료 → 제출 기록.
 * 라우트 화면(폰)과 태블릿 TwoPane 오른쪽 패널(inline)이 같이 쓴다.
 */
export function TaskDetail({
  taskId,
  inline = false,
  onClose,
  onChanged,
}: {
  taskId: string;
  /** 태블릿 오른쪽 패널로 그릴 때 — 헤더가 닫기(X) */
  inline?: boolean;
  onClose?: () => void;
  /** 제출 뒤 목록 새로고침 */
  onChanged?: () => void;
}) {
  const { data, error, isLoading, isRefreshing, refresh, retry } = useMobileQuery<MobileTaskDetail>(
    studentTaskPath(taskId),
  );

  // 상세를 불러오면 서버가 받은 피드백을 읽음 처리한다 → 탭·전체 배지 갱신
  useEffect(() => {
    if (data) refreshBadges();
  }, [data]);

  if (!data) {
    return (
      <Screen
        kind={inline ? 'modal' : 'push'}
        title="과제"
        onBack={inline ? onClose : undefined}
        backFallback={TASKS_TAB}>
        {isLoading || !error ? (
          <DetailSkeleton />
        ) : (
          <ErrorState message={error} onRetry={() => void retry()} />
        )}
      </Screen>
    );
  }

  const latest = data.submissions[0];
  // 새 제출·상태 변경 시 폼을 서버 값으로 다시 채운다
  const formKey = `${data.id}:${latest?.id ?? '-'}:${latest?.submittedAt ?? '-'}:${data.status}`;

  return (
    <LoadedTaskDetail
      key={formKey}
      task={data}
      inline={inline}
      onClose={onClose}
      refreshing={isRefreshing}
      onRefresh={() => void refresh()}
      onSubmitted={async () => {
        onChanged?.();
        await refresh();
      }}
    />
  );
}

function LoadedTaskDetail({
  task,
  inline,
  onClose,
  refreshing,
  onRefresh,
  onSubmitted,
}: {
  task: MobileTaskDetail;
  inline: boolean;
  onClose?: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  onSubmitted: () => Promise<void>;
}) {
  const navigation = useNavigation();
  const latest = task.submissions[0] ?? null;
  const isDone = task.status === 'DONE';
  const revision = task.status === 'NEEDS_REVISION';
  const status = TASK_STATUS[task.status] ?? TASK_STATUS.OPEN;
  const due = dueInfo(task.dueDate, isDone || task.status === 'SUBMITTED');

  // 웹 TaskSubmissionForm 과 같은 초기값: 수정 요청이면 빈 폼, 아니면 최근 제출물로 채움
  const initialFiles = revision || !latest ? [] : latest.files;
  const initialNote = revision ? '' : (latest?.note ?? '');
  const [kept, setKept] = useState<MobileTaskFile[]>(initialFiles);
  const [assets, setAssets] = useState<DocumentPickerAsset[]>([]);
  const [note, setNote] = useState(initialNote);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const busy = useRef(false);
  // 올리다 실패했을 때 다시 누르면 이미 올린 파일은 건너뛴다
  const uploadedCache = useRef(new Map<string, MobileTaskFile>());

  const fileCount = kept.length + assets.length;
  const dirty =
    !isDone &&
    !submitted &&
    (assets.length > 0 || note.trim() !== initialNote.trim() || kept.length !== initialFiles.length);

  // 작성 중에 뒤로 가면 확인 (폰 라우트 화면에서만)
  usePreventRemove(!inline && dirty && !submitting, ({ data }) => {
    void confirm({
      title: '작성한 내용이 사라져요',
      message: '고른 파일과 코멘트는 제출해야 저장돼요. 그래도 나갈까요?',
      confirmText: '나가기',
      cancelText: '계속 작성',
      destructive: true,
    }).then((ok) => {
      if (ok) navigation.dispatch(data.action);
    });
  });

  // createOrUpdateSubmission 규칙: 최신 제출에 피드백이 있으면 새 버전, 없으면 같은 버전 덮어쓰기
  const latestHasFeedback = !!latest && latest.feedbacks.length > 0;
  const submitTitle = !latest ? '과제 제출' : latestHasFeedback ? '수정본 제출' : '제출물 수정';
  const submitDescription = !latest
    ? '파일을 올리면 컨설턴트가 검토하고 피드백을 남겨줘요.'
    : latestHasFeedback
      ? `새 버전(v${latest.version + 1})으로 저장돼요.`
      : `피드백을 받기 전이라 v${latest.version}을 바로 고칠 수 있어요.`;

  async function submit() {
    if (busy.current) return;
    if (fileCount === 0) {
      toast('파일을 1개 이상 첨부해 주세요', 'error');
      return;
    }
    busy.current = true;
    setSubmitting(true);
    try {
      const fresh: MobileTaskFile[] = [];
      for (const asset of assets) {
        const key = `${asset.uri}|${asset.name}`;
        let file = uploadedCache.current.get(key);
        if (!file) {
          file = await uploadMobileTaskFile(asset, { context: 'task', taskId: task.id });
          uploadedCache.current.set(key, file);
        }
        fresh.push(file);
      }
      await submitStudentTask(task.id, {
        files: [...kept, ...fresh],
        note: note.trim() || null,
      });
      toast(latest ? '다시 제출했어요' : '제출했어요', 'success');
      refreshBadges();
      // 새로고침이 실패해도 화면이 제출된 상태를 보이도록 먼저 반영 (성공하면 서버 값으로 다시 채워짐)
      setKept([...kept, ...fresh]);
      setAssets([]);
      setSubmitted(true);
      busy.current = false;
      setSubmitting(false);
      await onSubmitted();
    } catch (e) {
      busy.current = false;
      setSubmitting(false);
      toast(e instanceof Error ? e.message : '제출하지 못했어요. 다시 시도해 주세요.', 'error');
    }
  }

  return (
    <Screen
      kind={inline ? 'modal' : 'push'}
      title="과제"
      onBack={inline ? onClose : undefined}
      backFallback={TASKS_TAB}
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        isDone ? undefined : (
          <Button
            variant="primary"
            size="xl"
            block
            loading={submitting}
            disabled={fileCount === 0}
            onPress={() => void submit()}>
            {latest ? '다시 제출하기' : '제출하기'}
          </Button>
        )
      }>
      <Stack>
        {/* 제목 */}
        <Section>
          <View style={s.badges}>
            <Badge>{task.subject}</Badge>
            {task.format ? <Badge>{task.format}</Badge> : null}
          </View>
          <Text variant="t8-bold" style={{ marginTop: space.x3 }}>
            {task.title}
          </Text>
          {task.description ? (
            <Text variant="t5-regular" color="neutralMuted" selectable style={{ marginTop: space.x2_5 }}>
              {task.description}
            </Text>
          ) : null}
        </Section>

        {/* 정보 */}
        <Section>
          <InfoRow label="상태">
            <Badge tone={status.tone} size="md">
              {status.label}
            </Badge>
          </InfoRow>
          <InfoRow label="마감일">
            <View style={s.dueRow}>
              <Text variant="t5-medium" tabular style={{ flexShrink: 1 }} align="right">
                {formatMonthDayWeekday(task.dueDate)}
              </Text>
              {!isDone && (
                <Badge tone={due.tone} style={{ alignSelf: 'center' }}>
                  {due.label}
                </Badge>
              )}
            </View>
          </InfoRow>
          <InfoRow label="최근 제출">
            {latest ? (
              <Text variant="t5-medium" tabular align="right">
                v{latest.version} · {formatDateTimeKST(latest.submittedAt)}
              </Text>
            ) : (
              <Text variant="t5-regular" color="neutralSubtle">
                아직 없어요
              </Text>
            )}
          </InfoRow>
        </Section>

        {/* 제출 */}
        {!isDone && (
          <Section title={submitTitle} description={submitDescription}>
            {revision && (
              <Notice tone="bad" icon={CircleAlert} style={{ marginBottom: space.x5 }}>
                컨설턴트가 수정을 요청했어요. 아래 제출 기록에서 피드백을 확인해 주세요.
              </Notice>
            )}
            <View style={{ gap: space.x6 }}>
              <TaskFilePicker
                assets={assets}
                onChange={setAssets}
                uploaded={kept}
                onChangeUploaded={setKept}
                disabled={submitting}
              />
              <TextField
                label="코멘트"
                indicator="선택"
                multiline
                minHeight={94}
                maxLength={2000}
                value={note}
                onChangeText={setNote}
                editable={!submitting}
                placeholder="컨설턴트에게 전할 내용이 있으면 적어 주세요"
              />
            </View>
          </Section>
        )}

        {isDone && latest && (
          <Section>
            <View style={s.doneRow}>
              <IconTile icon={CheckCircle2} tone="ok" size={48} round />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="t6-bold">최종 완료된 과제예요</Text>
                <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x0_5 }}>
                  컨설턴트가 최종 승인했어요.
                </Text>
              </View>
            </View>
          </Section>
        )}

        {/* 제출 기록 */}
        {task.submissions.length > 0 && (
          <View style={{ paddingTop: space.x3 }}>
            <GroupLabel trailing={`${task.submissions.length}개`}>제출 기록</GroupLabel>
            <SubmissionThread submissions={task.submissions} />
          </View>
        )}
      </Stack>
    </Screen>
  );
}

function DetailSkeleton() {
  return (
    <Stack>
      <Section>
        <View style={s.badges}>
          <Skeleton style={{ width: 44, height: 20 }} />
          <Skeleton style={{ width: 56, height: 20 }} />
        </View>
        <Skeleton style={{ width: '72%', height: 28, marginTop: space.x3 }} />
        <Skeleton style={{ width: '100%', height: 16, marginTop: space.x3 }} />
        <Skeleton style={{ width: '84%', height: 16, marginTop: space.x2 }} />
      </Section>
      <Section>
        {[0, 1, 2].map((i) => (
          <View key={i} style={s.skeletonInfo}>
            <Skeleton style={{ width: 56, height: 18 }} />
            <Skeleton style={{ width: 120, height: 18 }} />
          </View>
        ))}
      </Section>
      <Section>
        <Skeleton style={{ width: 96, height: 22 }} />
        <Skeleton style={{ width: '80%', height: 16, marginTop: space.x2 }} />
        <Skeleton style={{ width: '100%', height: 52, marginTop: space.x5, borderRadius: 12 }} />
      </Section>
    </Stack>
  );
}

const s = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.x1_5 },
  dueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space.x2 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: space.x3_5 },
  skeletonInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.x2_5,
  },
});
