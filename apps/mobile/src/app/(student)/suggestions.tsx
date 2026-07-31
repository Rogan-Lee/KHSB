import { Lightbulb, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { FormSheet } from '@/components/form-sheet';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  Segmented,
} from '@/components/mobile-ui';
import { FormError, FormInput } from '@/components/workflow-ui';
import { colors, palette, radius, spacing, Tone, type } from '@/constants/theme';
import { formatRelativeTime } from '@/lib/format';
import { mutateMobileApi, useMobileQuery } from '@/lib/mobile-api';
import type {
  SuggestionCategory,
  SuggestionItem,
  SuggestionListResponse,
  SuggestionStatus,
} from '@/lib/mobile-api';

const BASE = '/api/mobile/v1/student/suggestions';

const CATEGORIES: { label: string; value: SuggestionCategory }[] = [
  { label: '시설', value: 'FACILITY' },
  { label: '수업', value: 'CLASS' },
  { label: '운영', value: 'OPERATION' },
  { label: '기타', value: 'ETC' },
];

function statusTone(status: SuggestionStatus): Tone {
  switch (status) {
    case 'REFLECTED':
      return 'positive';
    case 'REVIEWING':
      return 'blue';
    case 'DECLINED':
      return 'neutral';
    default:
      return 'warning';
  }
}

export default function StudentSuggestionsScreen() {
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<SuggestionListResponse>(BASE);
  const [sheetOpen, setSheetOpen] = useState(false);
  const items = data?.items ?? [];

  return (
    <AppScreen
      eyebrow="SUGGESTIONS"
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="시설·수업·운영에 대한 제안"
      title="건의사항">
      <PrimaryButton onPress={() => setSheetOpen(true)}>
        <View style={styles.newBtn}>
          <Plus color={colors.textOncolor} size={18} strokeWidth={2.4} />
          <Text style={styles.newBtnText}>새 건의 작성</Text>
        </View>
      </PrimaryButton>

      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data && items.length === 0 ? (
        <EmptyState
          title="작성한 건의가 없어요"
          message="불편한 점이나 제안할 내용을 자유롭게 남겨주세요."
        />
      ) : null}

      <View style={styles.list}>
        {items.map((item) => (
          <SuggestionCard key={item.id} item={item} />
        ))}
      </View>

      {sheetOpen ? (
        <SuggestionForm
          onClose={() => setSheetOpen(false)}
          onCreated={async () => {
            setSheetOpen(false);
            await refresh();
          }}
        />
      ) : null}
    </AppScreen>
  );
}

function SuggestionCard({ item }: { item: SuggestionItem }) {
  return (
    <Card>
      <View style={styles.cardTop}>
        <View style={styles.badges}>
          <Badge tone="info">{item.categoryLabel}</Badge>
          <Badge tone={statusTone(item.status)}>{item.statusLabel}</Badge>
          {item.hasUnseenUpdate ? <Badge tone="negative">NEW</Badge> : null}
        </View>
        <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.content}>{item.content}</Text>
      {item.staffReply ? (
        <View style={styles.reply}>
          <Text style={styles.replyLabel}>
            답변{item.handledByName ? ` · ${item.handledByName}` : ''}
          </Text>
          <Text style={styles.replyText}>{item.staffReply}</Text>
        </View>
      ) : null}
    </Card>
  );
}

function SuggestionForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [category, setCategory] = useState<SuggestionCategory>('FACILITY');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!title.trim()) {
      setError('제목을 입력해 주세요.');
      return;
    }
    if (!content.trim()) {
      setError('건의 내용을 입력해 주세요.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await mutateMobileApi(BASE, 'POST', {
        category,
        title: title.trim(),
        content: content.trim(),
      });
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '제출하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormSheet
      onClose={onClose}
      subtitle="작성한 건의는 담당 직원이 검토합니다"
      title="새 건의 작성"
      visible>
      <Text style={styles.fieldLabel}>분류</Text>
      <Segmented
        options={CATEGORIES}
        value={category}
        onChange={(v) => setCategory(v as SuggestionCategory)}
      />
      <FormInput
        label="제목"
        maxLength={120}
        onChangeText={setTitle}
        placeholder="한 줄로 요약해 주세요"
        value={title}
      />
      <FormInput
        label="내용"
        maxLength={2000}
        multiline
        onChangeText={setContent}
        placeholder="자세한 내용을 적어주세요"
        value={content}
      />
      <FormError message={error} />
      <PrimaryButton disabled={submitting} onPress={() => void submit()}>
        {submitting ? '제출 중…' : '건의 제출하기'}
      </PrimaryButton>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  newBtn: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  newBtnText: { ...type.label1, color: colors.textOncolor, fontWeight: '700' },
  list: { gap: spacing.md },
  cardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  badges: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  time: { ...type.caption2, color: colors.textAssistive },
  title: { ...type.label1, color: colors.textNormal, marginTop: spacing.sm },
  content: {
    ...type.body3,
    color: colors.textAlternative,
    lineHeight: 21,
    marginTop: 4,
  },
  reply: {
    backgroundColor: palette.blue5,
    borderRadius: radius.lg,
    gap: 4,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  replyLabel: { ...type.caption2, color: palette.blue50, fontWeight: '700' },
  replyText: { ...type.body3, color: colors.textNormal, lineHeight: 20 },
  fieldLabel: { ...type.label2, color: colors.textNormal, marginBottom: 8 },
});
