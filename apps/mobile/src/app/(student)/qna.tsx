import type { ImagePickerAsset } from 'expo-image-picker';
import { CircleCheckBig, Clock3 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { AttachmentPicker } from '@/components/attachment-picker';
import { DocAttachField } from '@/components/doc-attach-field';
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
import { FormError, FormInput, MessageThread } from '@/components/workflow-ui';
import { colors, spacing } from '@/constants/theme';
import { formatRelativeTime } from '@/lib/format';
import {
  MobileAttachment,
  mutateMobileApi,
  QuestionThreadResponse,
  StudentQuestionsResponse,
  uploadMobileMedia,
  useMobileQuery,
} from '@/lib/mobile-api';

const STATUS_LABELS = {
  OPEN: '답변 대기',
  ANSWERED: '답변 완료',
  RESOLVED: '해결됨',
  ARCHIVED: '보관됨',
} as const;

export default function StudentQnaScreen() {
  const [createVisible, setCreateVisible] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StudentQuestionsResponse>('/api/mobile/v1/student/questions');

  return (
    <AppScreen
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="담당 멘토와 질문을 주고받을 수 있습니다."
      title="질의응답">
      <PrimaryButton onPress={() => setCreateVisible(true)}>새 질문 작성</PrimaryButton>

      <SectionTitle>내 질문</SectionTitle>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data?.questions.length === 0 ? (
        <EmptyState message="등록한 질문이 없습니다." title="질문 내역이 없습니다" />
      ) : null}
      <View style={styles.list}>
        {data?.questions.map((question) => {
          const answered = question.status !== 'OPEN';
          return (
            <Pressable
              accessibilityRole="button"
              key={question.id}
              onPress={() => setSelectedQuestionId(question.id)}
              style={({ pressed }) => pressed && styles.pressed}>
              <Card style={styles.question}>
                <View style={styles.questionTop}>
                  <Badge tone={answered ? 'primary' : 'amber'}>
                    {question.hasUnreadAnswer ? '새 답변' : STATUS_LABELS[question.status]}
                  </Badge>
                  <Text style={styles.time}>{formatRelativeTime(question.lastMessageAt)}</Text>
                </View>
                <Text style={styles.subject}>{question.subject ?? '과목 미지정'}</Text>
                <Text style={styles.title}>{question.title}</Text>
                {question.lastMessage ? (
                  <Text numberOfLines={2} style={styles.preview}>
                    {question.lastMessage}
                  </Text>
                ) : null}
                <View style={styles.meta}>
                  {answered ? (
                    <CircleCheckBig color={colors.primary} size={15} />
                  ) : (
                    <Clock3 color={colors.amber} size={15} />
                  )}
                  <Text style={styles.metaText}>
                    {question.hasAttachments ? '사진 첨부 · ' : ''}
                    {question.lastSenderType === 'STAFF'
                      ? '멘토가 답변했습니다.'
                      : '답변을 기다리고 있습니다.'}
                  </Text>
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>

      {createVisible ? (
        <CreateQuestionSheet
          onClose={() => setCreateVisible(false)}
          onCreated={async () => {
            setCreateVisible(false);
            await refresh();
          }}
        />
      ) : null}
      {selectedQuestionId ? (
        <StudentQuestionSheet
          onChanged={refresh}
          onClose={() => {
            setSelectedQuestionId(null);
            void refresh();
          }}
          questionId={selectedQuestionId}
        />
      ) : null}
    </AppScreen>
  );
}

function CreateQuestionSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [assets, setAssets] = useState<ImagePickerAsset[]>([]);
  const [docs, setDocs] = useState<MobileAttachment[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      const images = await Promise.all(
        assets.map((asset) => uploadMobileMedia(asset, { context: 'question' })),
      );
      await mutateMobileApi<{ id: string }>('/api/mobile/v1/student/questions', 'POST', {
        attachments: [...images, ...docs],
        content,
        subject,
        title,
      });
      setTitle('');
      setSubject('');
      setContent('');
      setAssets([]);
      setDocs([]);
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '질문을 등록하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormSheet
      onClose={onClose}
      subtitle="제목과 질문 내용을 입력하면 운영진에게 전달됩니다."
      title="새 질문"
      visible>
      <FormInput
        label="과목"
        maxLength={40}
        onChangeText={setSubject}
        placeholder="예: 수학"
        value={subject}
      />
      <FormInput
        label="질문 제목"
        maxLength={120}
        onChangeText={setTitle}
        placeholder="질문의 핵심을 입력하세요"
        value={title}
      />
      <FormInput
        label="질문 내용"
        maxLength={4000}
        multiline
        onChangeText={setContent}
        placeholder="어디에서 막혔는지 자세히 적어주세요"
        value={content}
      />
      <AttachmentPicker assets={assets} onChange={setAssets} />
      <DocAttachField onChange={setDocs} value={docs} />
      <FormError message={error} />
      <PrimaryButton disabled={submitting} onPress={() => void submit()}>
        {submitting ? '등록 중' : '질문 등록'}
      </PrimaryButton>
    </FormSheet>
  );
}

function StudentQuestionSheet({
  onChanged,
  onClose,
  questionId,
}: {
  onChanged: () => Promise<void>;
  onClose: () => void;
  questionId: string;
}) {
  const [message, setMessage] = useState('');
  const [assets, setAssets] = useState<ImagePickerAsset[]>([]);
  const [docs, setDocs] = useState<MobileAttachment[]>([]);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { data, error, isLoading, refresh, retry } = useMobileQuery<QuestionThreadResponse>(
    `/api/mobile/v1/student/questions/${questionId}`,
  );

  async function sendMessage() {
    setSubmitError('');
    setSubmitting(true);
    try {
      const images = await Promise.all(
        assets.map((asset) => uploadMobileMedia(asset, { context: 'question' })),
      );
      await mutateMobileApi(
        `/api/mobile/v1/student/questions/${questionId}/messages`,
        'POST',
        { attachments: [...images, ...docs], content: message },
      );
      setMessage('');
      setAssets([]);
      setDocs([]);
      await Promise.all([refresh(), onChanged()]);
    } catch (caught) {
      setSubmitError(
        caught instanceof Error ? caught.message : '추가 질문을 전송하지 못했습니다.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormSheet
      onClose={onClose}
      subtitle={data?.question.subject ?? '과목 미지정'}
      title={data?.question.title ?? '질문 상세'}
      visible>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data ? <MessageThread messages={data.messages} viewer="STUDENT" /> : null}
      {data?.question.status !== 'ARCHIVED' ? (
        <>
          <FormInput
            label="추가 질문"
            maxLength={4000}
            multiline
            onChangeText={setMessage}
            placeholder="추가로 궁금한 내용을 입력하세요"
            value={message}
          />
          <AttachmentPicker assets={assets} onChange={setAssets} />
          <DocAttachField onChange={setDocs} value={docs} />
          <FormError message={submitError} />
          <PrimaryButton disabled={submitting} onPress={() => void sendMessage()}>
            {submitting ? '전송 중' : '추가 질문 전송'}
          </PrimaryButton>
        </>
      ) : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.72,
  },
  question: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  questionTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    color: colors.muted,
    fontSize: 11,
  },
  subject: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: '800',
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  preview: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  meta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metaText: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
  },
});
