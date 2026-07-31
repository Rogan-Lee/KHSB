import {
  CheckCircle2,
  Circle,
  CircleAlert,
  Eye,
  Pin,
  Plus,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
import { FormError, FormInput } from '@/components/workflow-ui';
import { colors, spacing } from '@/constants/theme';
import { formatShortDateTime } from '@/lib/format';
import {
  mutateMobileApi,
  StaffHandoversResponse,
  useMobileQuery,
} from '@/lib/mobile-api';

export function HandoverSheet({
  onChanged,
  onClose,
}: {
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading, refresh, retry } =
    useMobileQuery<StaffHandoversResponse>('/api/mobile/v1/staff/handovers');

  return (
    <FormSheet
      onClose={onClose}
      subtitle="최근 14일 인수인계와 할 일을 확인합니다."
      title="할 일·인수인계"
      visible>
      <PrimaryButton onPress={() => setCreating((value) => !value)} variant="secondary">
        {creating ? '작성 취소' : '새 인수인계 작성'}
      </PrimaryButton>
      {creating ? (
        <CreateHandoverForm
          onCreated={async () => {
            setCreating(false);
            await Promise.all([refresh(), onChanged()]);
          }}
        />
      ) : null}

      <SectionTitle>최근 인수인계</SectionTitle>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data?.items.length === 0 ? (
        <EmptyState message="최근 등록된 인수인계가 없습니다." />
      ) : null}
      <View style={styles.list}>
        {data?.items.map((handover) => (
          <HandoverCard
            handover={handover}
            key={handover.id}
            onChanged={async () => {
              await Promise.all([refresh(), onChanged()]);
            }}
          />
        ))}
      </View>
    </FormSheet>
  );
}

function CreateHandoverForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'URGENT' | 'NORMAL'>('NORMAL');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await mutateMobileApi('/api/mobile/v1/staff/handovers', 'POST', {
        category,
        content,
        priority,
      });
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '인수인계를 등록하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card style={styles.createCard}>
      <View style={styles.createTitleRow}>
        <Plus color={colors.primary} size={20} />
        <Text style={styles.createTitle}>새 인수인계</Text>
      </View>
      <View style={styles.segmented}>
        {(['NORMAL', 'URGENT'] as const).map((value) => (
          <Pressable
            accessibilityRole="button"
            key={value}
            onPress={() => setPriority(value)}
            style={[
              styles.segment,
              priority === value && (value === 'URGENT' ? styles.urgentSegment : styles.activeSegment),
            ]}>
            <Text
              style={[
                styles.segmentText,
                priority === value && styles.activeSegmentText,
              ]}>
              {value === 'URGENT' ? '긴급' : '일반'}
            </Text>
          </Pressable>
        ))}
      </View>
      <FormInput
        label="분류"
        maxLength={40}
        onChangeText={setCategory}
        placeholder="예: 시설, 학생, 마감"
        value={category}
      />
      <FormInput
        label="내용"
        maxLength={8000}
        multiline
        onChangeText={setContent}
        placeholder="다음 근무자에게 전달할 내용을 입력하세요"
        value={content}
      />
      <FormError message={error} />
      <PrimaryButton disabled={submitting} onPress={() => void submit()}>
        {submitting ? '등록 중' : '인수인계 등록'}
      </PrimaryButton>
    </Card>
  );
}

function HandoverCard({
  handover,
  onChanged,
}: {
  handover: StaffHandoversResponse['items'][number];
  onChanged: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function markRead() {
    setSubmitting(true);
    try {
      await mutateMobileApi(
        `/api/mobile/v1/staff/handovers/${handover.id}/read`,
        'POST',
        {},
      );
      await onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleItem(itemId: string, kind: 'TASK' | 'CHECKLIST') {
    setSubmitting(true);
    try {
      await mutateMobileApi(
        `/api/mobile/v1/staff/handovers/items/${itemId}`,
        'PATCH',
        { kind },
      );
      await onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card style={[styles.handover, !handover.isRead && styles.unreadHandover]}>
      <View style={styles.handoverTop}>
        <View style={styles.badges}>
          <Badge tone={handover.priority === 'URGENT' ? 'red' : 'primary'}>
            {handover.priority === 'URGENT' ? '긴급' : '일반'}
          </Badge>
          {handover.category ? <Badge tone="blue">{handover.category}</Badge> : null}
        </View>
        {handover.isPinned ? <Pin color={colors.amber} fill={colors.amber} size={16} /> : null}
      </View>
      <Text style={styles.content}>{handover.content}</Text>
      <Text style={styles.meta}>
        {handover.authorName} · {formatShortDateTime(handover.createdAt)}
        {handover.recipientName ? ` · 수신 ${handover.recipientName}` : ''}
      </Text>

      {handover.tasks.length > 0 ? (
        <View style={styles.items}>
          <Text style={styles.itemGroupTitle}>할 일</Text>
          {handover.tasks.map((task) => (
            <HandoverItem
              checked={task.isCompleted}
              disabled={submitting}
              key={task.id}
              label={task.title}
              onPress={() => void toggleItem(task.id, 'TASK')}
            />
          ))}
        </View>
      ) : null}
      {handover.checklist.length > 0 ? (
        <View style={styles.items}>
          <Text style={styles.itemGroupTitle}>체크리스트</Text>
          {handover.checklist.map((item) => (
            <HandoverItem
              checked={item.isChecked}
              disabled={submitting}
              key={item.id}
              label={item.title}
              onPress={() => void toggleItem(item.id, 'CHECKLIST')}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.readRow}>
        <View style={styles.readMeta}>
          {handover.isRead ? (
            <Eye color={colors.primary} size={15} />
          ) : (
            <CircleAlert color={colors.amber} size={15} />
          )}
          <Text style={styles.readText}>
            {handover.isRead ? `확인함 · 총 ${handover.readCount}명` : '아직 확인하지 않음'}
          </Text>
        </View>
        {!handover.isRead ? (
          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => void markRead()}
            style={({ pressed }) => [styles.readButton, pressed && styles.pressed]}>
            <Text style={styles.readButtonText}>확인 완료</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

function HandoverItem({
  checked,
  disabled,
  label,
  onPress,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      {checked ? (
        <CheckCircle2 color={colors.primary} size={19} />
      ) : (
        <Circle color={colors.muted} size={19} />
      )}
      <Text style={[styles.itemText, checked && styles.checkedText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  createCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  createTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  createTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  segmented: {
    backgroundColor: colors.canvas,
    borderRadius: 8,
    flexDirection: 'row',
    padding: 3,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
  },
  activeSegment: {
    backgroundColor: colors.primary,
  },
  urgentSegment: {
    backgroundColor: colors.red,
  },
  segmentText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  activeSegmentText: {
    color: colors.surface,
  },
  handover: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  unreadHandover: {
    borderColor: '#E3B970',
    borderWidth: 1.5,
  },
  handoverTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  content: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 22,
  },
  meta: {
    color: colors.muted,
    fontSize: 11,
  },
  items: {
    backgroundColor: colors.canvas,
    borderRadius: 8,
    gap: spacing.sm,
    padding: spacing.md,
  },
  itemGroupTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  item: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 30,
  },
  itemText: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
  },
  checkedText: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  readRow: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
  },
  readMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  readText: {
    color: colors.muted,
    fontSize: 11,
  },
  readButton: {
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  readButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.72,
  },
});
