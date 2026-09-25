import type { DocumentPickerAsset } from 'expo-document-picker';
import {
  CircleAlert,
  CircleCheck,
  Download,
  FileText,
  ImageIcon,
  Inbox,
  Lock,
  MessageSquare,
  MessageSquarePlus,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TaskFilePicker } from '@/components/task-file-picker';
import {
  Avatar,
  Badge,
  Button,
  color,
  EmptyState,
  ErrorState,
  FullSheet,
  GroupLabel,
  IconTile,
  InfoRow,
  Notice,
  Press,
  radius,
  Section,
  Segmented,
  showImages,
  space,
  Stack,
  Text,
  TextField,
  toast,
} from '@/design';
import {
  postTaskFeedback,
  staffTaskPath,
  type StaffTaskDetailResponse,
  type TaskFeedbackStatus,
} from '@/lib/api/staff-learning';
import { refreshBadges } from '@/lib/badges';
import { isStaffCapabilities } from '@/lib/capabilities';
import {
  uploadMobileTaskFile,
  useMobileQuery,
  type MobileTaskFile,
  type MobileTaskSubmission,
} from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

import { DetailFrame } from './detail-frame';
import { formatDate, formatDateTime } from './format';
import { openUrl } from './share';
import { DetailSkeleton } from './skeletons';
import { dueInfo, FEEDBACK_STATUS, TASK_STATUS } from './status';

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** 수행평가 제출물 검토 + 피드백. 라우트 화면과 태블릿 오른쪽 패널(inline)이 같이 쓴다. */
export function TaskReviewView({
  taskId,
  inline = false,
  onClose,
  onChanged,
}: {
  taskId: string;
  inline?: boolean;
  onClose?: () => void;
  onChanged?: () => void;
}) {
  const { session } = useSession();
  const caps = isStaffCapabilities(session?.capabilities) ? session.capabilities : null;
  const q = useMobileQuery<StaffTaskDetailResponse>(staffTaskPath(taskId));
  const data = q.data && q.data.id === taskId ? q.data : null;
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!data) {
    return (
      <DetailFrame inline={inline} title="수행평가" onClose={onClose} surface="canvas">
        {q.error && !q.isLoading ? (
          <ErrorState message={q.error} onRetry={() => void q.retry()} />
        ) : (
          <DetailSkeleton fields={2} />
        )}
      </DetailFrame>
    );
  }

  const status = TASK_STATUS[data.status];
  const isDone = data.status === 'DONE';
  const latest = data.submissions[0] ?? null;
  const due = dueInfo(data.dueDate, isDone || data.status === 'SUBMITTED');
  const canWrite = data.canWriteFeedback && !!caps?.writeFeedback && !!latest;

  return (
    <DetailFrame
      inline={inline}
      title={data.student.name}
      onClose={onClose}
      surface="canvas"
      refreshing={q.isRefreshing}
      onRefresh={() => void q.refresh()}
      footer={
        canWrite ? (
          <Button variant="primary" size="lg" block icon={MessageSquarePlus} onPress={() => setSheetOpen(true)}>
            피드백 남기기
          </Button>
        ) : undefined
      }>
      <Stack>
        {/* 과제 */}
        <Section>
          <View style={s.badges}>
            <Badge>{data.subject}</Badge>
            {data.format ? <Badge>{data.format}</Badge> : null}
          </View>
          <Text variant="t8-bold" style={{ marginTop: space.x3 }}>
            {data.title}
          </Text>
          <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x1 }}>
            {[data.student.name, data.student.grade, data.student.school].filter(Boolean).join(' · ')}
          </Text>
          {data.description ? (
            <Text variant="t5-regular" color="neutralMuted" style={{ marginTop: space.x3 }} selectable>
              {data.description}
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
            <View style={s.inline}>
              <Text variant="t5-medium" tabular>
                {formatDate(data.dueDate)}
              </Text>
              {!isDone ? <Badge tone={due.tone}>{due.label}</Badge> : null}
            </View>
          </InfoRow>
          <InfoRow label="최근 제출">
            {latest ? (
              <Text variant="t5-medium" tabular align="right">
                {`v${latest.version} · ${formatDateTime(latest.submittedAt)}`}
              </Text>
            ) : (
              <Text variant="t5-regular" color="neutralSubtle">
                아직 없어요
              </Text>
            )}
          </InfoRow>
          {data.scoreWeight != null ? <InfoRow label="배점">{String(data.scoreWeight)}</InfoRow> : null}
        </Section>

        {data.status === 'SUBMITTED' && canWrite ? (
          <Notice tone="warn" icon={CircleAlert}>
            학생이 제출했어요. 확인하고 피드백을 남겨 주세요.
          </Notice>
        ) : null}
        {!isDone && latest && !caps?.writeFeedback ? (
          <Notice tone="gray" icon={Lock}>
            피드백은 작성 권한이 있는 선생님만 남길 수 있어요.
          </Notice>
        ) : null}

        {isDone ? (
          <Section>
            <View style={s.doneRow}>
              <IconTile icon={CircleCheck} tone="ok" size={48} round />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="t6-bold">최종 완료된 과제예요</Text>
                <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x0_5 }}>
                  승인한 제출물이 결과로 확정됐어요.
                </Text>
              </View>
            </View>
          </Section>
        ) : null}

        {/* 제출 기록 */}
        {data.submissions.length === 0 ? (
          <Section>
            <EmptyState
              icon={Inbox}
              title="아직 제출한 내용이 없어요"
              description="학생이 과제를 내면 여기서 검토할 수 있어요."
              style={{ paddingVertical: space.x6 }}
            />
          </Section>
        ) : (
          <View style={{ paddingTop: space.x3 }}>
            <GroupLabel trailing={`${data.submissions.length}개`}>제출 기록</GroupLabel>
            <Stack>
              {data.submissions.map((sub, i) => (
                <SubmissionCard key={sub.id} sub={sub} isLatest={i === 0} />
              ))}
            </Stack>
          </View>
        )}
      </Stack>

      {latest && canWrite ? (
        <FeedbackSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          submission={latest}
          studentName={data.student.name}
          onSaved={async () => {
            setSheetOpen(false);
            refreshBadges();
            onChanged?.();
            await q.refresh();
          }}
        />
      ) : null}
    </DetailFrame>
  );
}

function SubmissionCard({ sub, isLatest }: { sub: MobileTaskSubmission; isLatest: boolean }) {
  return (
    <Section
      flush
      title={
        <View style={s.inline}>
          <Text variant="t6-bold">{`v${sub.version} 제출`}</Text>
          {isLatest ? <Badge tone="brand">최신</Badge> : null}
        </View>
      }
      description={
        <Text variant="t4-regular" color="neutralSubtle" tabular style={{ marginTop: space.x0_5 }}>
          {formatDateTime(sub.submittedAt)}
        </Text>
      }
      action={
        sub.feedbacks.length > 0 ? (
          <View style={s.inline}>
            <MessageSquare color={color.fg.neutralSubtle} size={16} strokeWidth={2.2} />
            <Text variant="t3-medium" color="neutralSubtle" tabular>
              {sub.feedbacks.length}
            </Text>
          </View>
        ) : undefined
      }>
      <Text variant="t4-bold" color="neutralMuted" style={s.subLabel}>
        {`첨부 파일 ${sub.files.length}`}
      </Text>
      {sub.files.map((f, i) => (
        <FileRow key={`${f.url}-${i}`} file={f} />
      ))}

      {sub.note ? (
        <View style={{ paddingHorizontal: space.x5, paddingTop: space.x4 }}>
          <Text variant="t4-bold" color="neutralMuted">
            학생이 남긴 말
          </Text>
          <Text variant="t5-regular" color="neutralMuted" style={s.noteBox} selectable>
            {sub.note}
          </Text>
        </View>
      ) : null}

      {sub.feedbacks.length > 0 ? (
        <View style={{ paddingHorizontal: space.x5, paddingTop: space.x5, paddingBottom: space.x3 }}>
          <Text variant="t4-bold" color="neutralMuted">
            {`피드백 ${sub.feedbacks.length}`}
          </Text>
          <View style={{ marginTop: space.x3, gap: space.x5 }}>
            {sub.feedbacks.map((f) => {
              const st = FEEDBACK_STATUS[f.status];
              return (
                <View key={f.id} style={{ flexDirection: 'row', gap: space.x3 }}>
                  <Avatar name={f.authorName} size={32} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={[s.inline, { flexWrap: 'wrap' }]}>
                      <Text variant="t5-bold">{f.authorName}</Text>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <Text variant="t3-regular" color="neutralSubtle" tabular>
                        {formatDateTime(f.createdAt)}
                      </Text>
                    </View>
                    <Text variant="t5-regular" color="neutralMuted" style={{ marginTop: space.x1_5 }} selectable>
                      {f.content}
                    </Text>
                    {f.files.length > 0 ? (
                      <View style={{ marginTop: space.x2_5, gap: space.x1_5 }}>
                        {f.files.map((af, i) => (
                          <AttachmentChip key={`${af.url}-${i}`} file={af} />
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={{ height: space.x2 }} />
      )}
    </Section>
  );
}

function FileRow({ file }: { file: MobileTaskFile }) {
  const isImage = file.mimeType?.startsWith('image/');
  return (
    <Press
      onPress={() => void (isImage ? showImages([file.url]) : openUrl(file.url))}
      scale={0}
      pressedBg
      accessibilityLabel={`${file.name} 열기`}
      style={s.fileRow}>
      <IconTile icon={isImage ? ImageIcon : FileText} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="t5-medium" numberOfLines={1}>
          {file.name}
        </Text>
        <Text variant="t3-regular" color="neutralSubtle" tabular style={{ marginTop: space.x0_5 }}>
          {formatSize(file.sizeBytes)}
        </Text>
      </View>
      <View style={s.downloadDot}>
        <Download color={color.fg.neutralMuted} size={18} strokeWidth={2.2} />
      </View>
    </Press>
  );
}

function AttachmentChip({ file }: { file: MobileTaskFile }) {
  const isImage = file.mimeType?.startsWith('image/');
  const Icon = isImage ? ImageIcon : FileText;
  return (
    <Press onPress={() => void (isImage ? showImages([file.url]) : openUrl(file.url))} accessibilityLabel={`${file.name} 열기`} style={s.attach}>
      <Icon color={color.fg.neutralSubtle} size={16} strokeWidth={2.2} />
      <Text variant="t4-medium" color="neutralMuted" numberOfLines={1} style={{ flex: 1 }}>
        {file.name}
      </Text>
      <Text variant="t3-regular" color="neutralSubtle" tabular>
        {formatSize(file.sizeBytes)}
      </Text>
    </Press>
  );
}

const STATUS_OPTIONS: { value: TaskFeedbackStatus; label: string }[] = [
  { value: 'COMMENT', label: '코멘트' },
  { value: 'NEEDS_REVISION', label: '수정 요청' },
  { value: 'APPROVED', label: '승인' },
];

const STATUS_HINT: Record<TaskFeedbackStatus, string> = {
  COMMENT: '과제 상태는 그대로 두고 의견만 남겨요.',
  NEEDS_REVISION: '학생에게 수정본을 다시 내 달라고 알려요.',
  APPROVED: '최종 완료로 바뀌고, 이 제출물이 결과로 확정돼요.',
};

/** 피드백 작성 — 전체 화면 시트 (최신 제출물 대상) */
function FeedbackSheet({
  visible,
  onClose,
  submission,
  studentName,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  submission: MobileTaskSubmission;
  studentName: string;
  onSaved: () => Promise<void>;
}) {
  const [status, setStatus] = useState<TaskFeedbackStatus>('COMMENT');
  const [content, setContent] = useState('');
  const [assets, setAssets] = useState<DocumentPickerAsset[]>([]);
  const [uploaded, setUploaded] = useState<MobileTaskFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);

  async function save() {
    if (lock.current) return;
    if (!content.trim()) {
      setError('피드백 내용을 적어 주세요');
      return;
    }
    setError(null);
    // 승인 확인은 시트 안 안내(Notice)로 대신한다 — iOS 는 모달 위에 확인 대화상자(모달)를 겹쳐 띄우지 못한다
    lock.current = true;
    setSaving(true);
    try {
      // 올린 파일은 기억해 두고 다음 시도에서 다시 올리지 않는다
      const files = [...uploaded];
      for (const asset of assets) {
        const file = await uploadMobileTaskFile(asset, { context: 'feedback', submissionId: submission.id });
        files.push(file);
        setUploaded((prev) => [...prev, file]);
        setAssets((prev) => prev.filter((a) => a !== asset));
      }
      await postTaskFeedback(submission.id, { content: content.trim(), files, status });
      toast(
        status === 'APPROVED'
          ? '승인했어요'
          : status === 'NEEDS_REVISION'
            ? '수정을 요청했어요'
            : '피드백을 남겼어요',
        'success',
      );
      setContent('');
      setAssets([]);
      setUploaded([]);
      setStatus('COMMENT');
      await onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : '피드백을 저장하지 못했어요', 'error');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <FullSheet
      visible={visible}
      onClose={() => !saving && onClose()}
      title="피드백 남기기"
      subtitle={`${studentName} · v${submission.version} 제출물에 남겨요`}
      footer={
        <View style={{ flex: 1 }}>
          <Button
            variant={status === 'NEEDS_REVISION' ? 'danger' : 'primary'}
            size="lg"
            block
            loading={saving}
            onPress={() => void save()}>
            {status === 'APPROVED' ? '승인하기' : status === 'NEEDS_REVISION' ? '수정 요청하기' : '피드백 저장'}
          </Button>
        </View>
      }>
      <View style={{ gap: space.x2 }}>
        <Text variant="t5-medium">처리</Text>
        <Segmented options={STATUS_OPTIONS} value={status} onChange={setStatus} disabled={saving} />
        {status === 'APPROVED' ? (
          <Notice tone="warn" icon={CircleAlert} style={{ marginTop: space.x1 }}>
            {`${STATUS_HINT.APPROVED} 승인한 뒤에는 이 과제에 피드백을 더 남길 수 없어요.`}
          </Notice>
        ) : (
          <Text variant="t3-regular" color="neutralSubtle">
            {STATUS_HINT[status]}
          </Text>
        )}
      </View>
      <TextField
        label="피드백 내용"
        value={content}
        onChangeText={(v) => {
          setContent(v);
          if (error && v.trim()) setError(null);
        }}
        placeholder="학생에게 전할 피드백을 적어 주세요"
        multiline
        minHeight={180}
        maxLength={4000}
        showCount
        errorMessage={error}
        editable={!saving}
      />
      {uploaded.length > 0 ? (
        <Text variant="t3-regular" color="neutralSubtle">
          {`이미 올린 파일 ${uploaded.length}개가 함께 저장돼요.`}
        </Text>
      ) : null}
      <TaskFilePicker assets={assets} onChange={setAssets} max={Math.max(1, 5 - uploaded.length)} />
    </FullSheet>
  );
}

const s = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x1_5 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: space.x3_5 },
  subLabel: { paddingHorizontal: space.x5, paddingTop: space.x3, paddingBottom: space.x1 },
  noteBox: {
    marginTop: space.x2,
    backgroundColor: color.bg.layerFill,
    borderRadius: radius.r4,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
    overflow: 'hidden',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3_5,
    marginHorizontal: space.x2,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2_5,
    borderRadius: radius.r4,
  },
  downloadDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg.neutralWeak,
  },
  attach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2_5,
    minHeight: 44,
    paddingHorizontal: space.x3,
    borderRadius: radius.r3,
    backgroundColor: color.bg.layerFill,
  },
});
