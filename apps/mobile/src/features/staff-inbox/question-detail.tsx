import type { ImagePickerAsset } from 'expo-image-picker';
import { useRouter } from 'expo-router';
import {
  Archive,
  CircleCheck,
  MessageSquareReply,
  RotateCcw,
  UserCheck,
  UserX,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AttachmentPicker } from '@/components/attachment-picker';
import { DocAttachField } from '@/components/doc-attach-field';
import { MessageThread } from '@/components/workflow-ui';
import {
  Avatar,
  Badge,
  Button,
  Divider,
  ErrorState,
  FullSheet,
  InfoRow,
  Screen,
  Section,
  Skeleton,
  Stack,
  Text,
  TextField,
  confirm,
  space,
  toast,
} from '@/design';
import {
  answerQuestion,
  claimQuestion,
  releaseQuestion,
  setQuestionStatus,
  staffInboxPaths,
} from '@/lib/api/staff-inbox';
import { refreshBadges } from '@/lib/badges';
import {
  uploadMobileMedia,
  useMobileQuery,
  type MobileAttachment,
  type QuestionThreadResponse,
} from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

import { QUESTION_STATUS } from './status';
import { formatInboxTime } from './time';
import { DetailPanel, errorText } from './ui';

const MAX_ATTACHMENTS = 5;
const MAX_ANSWER = 4000;

type Busy = null | 'claim' | 'status';

/**
 * 학생 질문 답변 화면 본문 — 폰은 라우트(/(staff)/qna/[id]) 로 push, 태블릿은 소통 탭 오른쪽 패널(inline).
 */
export function QuestionDetail({
  questionId,
  inline = false,
  onClose,
  onChanged,
}: {
  questionId: string;
  inline?: boolean;
  /** 태블릿 패널 닫기 */
  onClose?: () => void;
  /** 담당·상태·답변이 바뀌면 (목록 갱신용) */
  onChanged?: () => void;
}) {
  const router = useRouter();
  const { session } = useSession();
  const { data, error, isLoading, isRefreshing, refresh, retry } = useMobileQuery<QuestionThreadResponse>(
    staffInboxPaths.question(questionId),
  );
  const [busy, setBusy] = useState<Busy>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  // 스레드를 열면 서버가 읽음 처리 → 소통 탭 배지 갱신
  const loadedId = data?.question.id;
  useEffect(() => {
    if (loadedId) refreshBadges();
  }, [loadedId]);

  const q = data?.question;
  const claimedByMe = !!q?.claimedBy && q.claimedBy.id === session?.domainId;

  const changed = async () => {
    await refresh();
    onChanged?.();
    refreshBadges();
  };

  const leave = () => {
    if (inline) onClose?.();
    else if (router.canGoBack()) router.back();
  };

  async function claim() {
    if (!q || busy) return;
    if (q.claimedBy && !claimedByMe) {
      const ok = await confirm({
        title: '담당을 가져올까요?',
        message: `${q.claimedBy.name}님이 담당하고 있는 질문이에요.`,
        confirmText: '가져오기',
      });
      if (!ok) return;
    }
    setBusy('claim');
    try {
      const r = await claimQuestion(q.id);
      toast(
        r.previousClaimerName ? `${r.previousClaimerName}님에게서 담당을 가져왔어요` : '내가 담당으로 지정했어요',
        'success',
      );
      await changed();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function release() {
    if (!q || busy) return;
    setBusy('claim');
    try {
      await releaseQuestion(q.id);
      toast('담당을 해제했어요', 'success');
      await changed();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(status: 'OPEN' | 'RESOLVED' | 'ARCHIVED') {
    if (!q || busy) return;
    if (status === 'ARCHIVED') {
      const ok = await confirm({
        title: '질문을 보관할까요?',
        message: '보관한 질문은 소통 목록에서 사라져요.',
        confirmText: '보관하기',
      });
      if (!ok) return;
    }
    setBusy('status');
    try {
      await setQuestionStatus(q.id, status);
      toast(
        status === 'RESOLVED' ? '해결 처리했어요' : status === 'OPEN' ? '다시 열었어요' : '보관했어요',
        'success',
      );
      if (status === 'ARCHIVED') {
        onChanged?.();
        refreshBadges();
        leave();
        return;
      }
      await changed();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  const content =
    isLoading && !data ? (
      <DetailSkeleton />
    ) : error && !data ? (
      <ErrorState message={error} onRetry={() => void retry()} />
    ) : q && data ? (
      <Stack>
        <Section>
          <View style={{ gap: space.x3 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x1 }}>
              <Badge tone={QUESTION_STATUS[q.status].tone}>{QUESTION_STATUS[q.status].label}</Badge>
              {q.subject ? <Badge tone="gray">{q.subject}</Badge> : null}
            </View>
            <Text variant="t7-bold">{q.title}</Text>
            {q.student ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
                <Avatar name={q.student.name} size={32} />
                <Text variant="t4-medium" style={{ flexShrink: 1 }} numberOfLines={1}>
                  {q.student.name}
                  <Text variant="t4-regular" color="neutralSubtle">
                    {` · ${q.student.grade}${q.student.school ? ` · ${q.student.school}` : ''}`}
                  </Text>
                </Text>
              </View>
            ) : null}
            <Divider />
            <View>
              <InfoRow label="담당">
                {q.claimedBy ? (claimedByMe ? '나' : q.claimedBy.name) : '아직 없어요'}
              </InfoRow>
              <InfoRow label="질문한 시각">{formatInboxTime(q.createdAt)}</InfoRow>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 }}>
              {claimedByMe ? (
                <Button variant="weak" size="sm" icon={UserX} loading={busy === 'claim'} disabled={!!busy} onPress={() => void release()}>
                  담당 해제
                </Button>
              ) : (
                <Button variant="weak" size="sm" icon={UserCheck} loading={busy === 'claim'} disabled={!!busy} onPress={() => void claim()}>
                  담당하기
                </Button>
              )}
              {q.status === 'RESOLVED' ? (
                <Button variant="weak" size="sm" icon={RotateCcw} loading={busy === 'status'} disabled={!!busy} onPress={() => void changeStatus('OPEN')}>
                  다시 열기
                </Button>
              ) : (
                <Button variant="weak" size="sm" icon={CircleCheck} loading={busy === 'status'} disabled={!!busy} onPress={() => void changeStatus('RESOLVED')}>
                  해결 처리
                </Button>
              )}
              <Button variant="ghost" size="sm" icon={Archive} disabled={!!busy} onPress={() => void changeStatus('ARCHIVED')}>
                보관
              </Button>
            </View>
          </View>
        </Section>

        <Section title="대화" description={`메시지 ${data.messages.length}개`}>
          <MessageThread messages={data.messages} viewer="STAFF" surface="panel" emptyHint="아직 메시지가 없어요." />
        </Section>
      </Stack>
    ) : null;

  const answerButton = (
    <Button
      variant="primary"
      size="lg"
      block
      icon={MessageSquareReply}
      disabled={!q}
      onPress={() => setComposerOpen(true)}
      style={inline ? { flex: 1 } : undefined}>
      답변 작성
    </Button>
  );

  const composer = q ? (
    <AnswerComposer
      open={composerOpen}
      onClose={() => setComposerOpen(false)}
      questionId={q.id}
      questionTitle={q.title}
      onAnswered={async () => {
        setComposerOpen(false);
        await changed();
      }}
    />
  ) : null;

  if (inline) {
    return (
      <>
        <DetailPanel
          title="학생 질문"
          onClose={onClose}
          footer={answerButton}
          refreshing={isRefreshing}
          onRefresh={() => void refresh()}>
          {content}
        </DetailPanel>
        {composer}
      </>
    );
  }

  return (
    <>
      <Screen
        kind="push"
        title="학생 질문"
        backFallback="/(staff)/(tabs)/inbox"
        refreshing={isRefreshing}
        onRefresh={() => void refresh()}
        footer={answerButton}>
        {content}
      </Screen>
      {composer}
    </>
  );
}

/** 답변 작성 — 글 + 풀이 사진 + 문서. 닫아도 작성 중인 내용은 남겨 둔다. */
function AnswerComposer({
  open,
  onClose,
  questionId,
  questionTitle,
  onAnswered,
}: {
  open: boolean;
  onClose: () => void;
  questionId: string;
  questionTitle: string;
  onAnswered: () => Promise<void>;
}) {
  const [answer, setAnswer] = useState('');
  const [assets, setAssets] = useState<ImagePickerAsset[]>([]);
  const [docs, setDocs] = useState<MobileAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const total = assets.length + docs.length;
  const tooMany = total > MAX_ATTACHMENTS;

  async function submit() {
    if (submitting || docUploading) return;
    const content = answer.trim();
    if (!content) {
      setFieldError('답변 내용을 입력해 주세요');
      return;
    }
    if (tooMany) {
      toast(`사진과 파일은 합쳐서 ${MAX_ATTACHMENTS}개까지 보낼 수 있어요`, 'error');
      return;
    }
    setSubmitting(true);
    try {
      const images = await Promise.all(assets.map((a) => uploadMobileMedia(a, { context: 'question' })));
      await answerQuestion(questionId, { content, attachments: [...images, ...docs] });
      setAnswer('');
      setAssets([]);
      setDocs([]);
      toast('답변을 등록했어요', 'success');
      await onAnswered();
    } catch (e) {
      toast(errorText(e, '답변을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FullSheet
      visible={open}
      onClose={onClose}
      title="답변 작성"
      subtitle={questionTitle}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          loading={submitting}
          disabled={!answer.trim() || tooMany || docUploading}
          onPress={() => void submit()}
          style={{ flex: 1 }}>
          답변 등록
        </Button>
      }>
      <TextField
        label="답변"
        value={answer}
        onChangeText={(t) => {
          setAnswer(t);
          if (fieldError) setFieldError(null);
        }}
        placeholder="풀이 과정과 설명을 적어 주세요"
        multiline
        minHeight={180}
        maxLength={MAX_ANSWER}
        showCount
        errorMessage={fieldError}
      />
      {/* 사진·파일은 합쳐서 5개까지 (서버 한도) — 이미 고른 건 줄이지 않도록 현재 개수 이상으로 */}
      <AttachmentPicker
        label="풀이 사진"
        indicator="선택"
        assets={assets}
        onChange={setAssets}
        max={Math.max(assets.length, MAX_ATTACHMENTS - docs.length)}
        disabled={submitting}
      />
      <DocAttachField
        label="파일"
        indicator="선택"
        value={docs}
        onChange={setDocs}
        max={Math.max(docs.length, MAX_ATTACHMENTS - assets.length)}
        disabled={submitting}
        onUploadingChange={setDocUploading}
      />
      <Text variant="t3-regular" color={tooMany ? 'critical' : 'neutralSubtle'}>
        {`사진과 파일은 합쳐서 ${MAX_ATTACHMENTS}개까지 보낼 수 있어요 (${total}/${MAX_ATTACHMENTS})`}
      </Text>
    </FullSheet>
  );
}

function DetailSkeleton() {
  return (
    <Stack>
      <Section>
        <View style={{ gap: space.x3 }}>
          <Skeleton style={{ width: 120, height: 20 }} />
          <Skeleton style={{ width: '80%', height: 24 }} />
          <Skeleton style={{ width: '50%', height: 18 }} />
          <Skeleton style={{ width: '100%', height: 36 }} />
        </View>
      </Section>
      <Section>
        <View style={{ gap: space.x3 }}>
          <Skeleton style={{ width: '70%', height: 64, borderRadius: 12 }} />
          <Skeleton style={{ width: '60%', height: 48, borderRadius: 12, alignSelf: 'flex-end' }} />
          <Skeleton style={{ width: '75%', height: 56, borderRadius: 12 }} />
        </View>
      </Section>
    </Stack>
  );
}
