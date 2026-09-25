import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Chip,
  ChipGroup,
  FullSheet,
  ListRow,
  Section,
  Skeleton,
  Stack,
  Text,
  TextField,
  color,
  confirm,
  radius,
  space,
  toast,
} from '@/design';
import { updateSuggestion, type StaffSuggestionItem } from '@/lib/api/staff-inbox';
import type { SuggestionStatus } from '@/lib/mobile-api';

import { SUGGESTION_STATUS, SUGGESTION_STATUS_ORDER } from './status';
import { formatDecidedAt, formatInboxTime } from './time';
import { DetailPanel, errorText } from './ui';

const MAX_REPLY = 2000;

export function SuggestionRow({
  item,
  selected,
  onPress,
}: {
  item: StaffSuggestionItem;
  selected: boolean;
  onPress: () => void;
}) {
  const status = SUGGESTION_STATUS[item.status];
  return (
    <ListRow
      align="start"
      onPress={onPress}
      style={selected ? { backgroundColor: color.bg.neutralWeak } : undefined}
      meta={
        <>
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone="gray">{item.categoryLabel}</Badge>
          {item.staffReply ? <Badge tone="ok">답변함</Badge> : null}
        </>
      }
      title={
        <Text variant="t5-medium" numberOfLines={1}>
          {item.title}
        </Text>
      }
      description={
        <View style={{ gap: space.x1 }}>
          <Text variant="t4-regular" color="neutralMuted" numberOfLines={2}>
            {item.content}
          </Text>
          <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1}>
            {`${item.student.name} · ${item.student.grade} · ${formatInboxTime(item.createdAt)}`}
          </Text>
        </View>
      }
    />
  );
}

/**
 * 건의 상세 + 처리(상태·답변). 폰은 전체 화면 시트, 태블릿은 오른쪽 패널(inline).
 * 저장하지 않은 변경이 있으면 닫기 전에 확인한다.
 */
export function SuggestionDetail({
  item,
  inline = false,
  onClose,
  onSaved,
}: {
  item: StaffSuggestionItem;
  inline?: boolean;
  onClose: () => void;
  onSaved: (item: StaffSuggestionItem) => void;
}) {
  const [status, setStatus] = useState<SuggestionStatus>(item.status);
  const [reply, setReply] = useState(item.staffReply ?? '');
  const [saving, setSaving] = useState(false);

  const savedReply = (item.staffReply ?? '').trim();
  const nextReply = reply.trim();
  // 답변은 지울 수 없다 (웹과 동일) — 비우면 답변은 그대로 두고 상태만 저장
  const replyChanged = nextReply.length > 0 && nextReply !== savedReply;
  const statusChanged = status !== item.status;
  const dirty = replyChanged || statusChanged;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const { item: updated } = await updateSuggestion(item.id, {
        ...(statusChanged ? { status } : {}),
        ...(replyChanged ? { reply: nextReply } : {}),
      });
      toast(replyChanged ? '답변을 저장했어요' : '상태를 바꿨어요', 'success');
      onSaved(updated);
      setReply(updated.staffReply ?? '');
      setStatus(updated.status);
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function close() {
    if (dirty && !saving) {
      const ok = await confirm({
        title: '저장하지 않고 닫을까요?',
        message: '바꾼 상태와 작성한 답변이 사라져요.',
        confirmText: '닫기',
        destructive: true,
      });
      if (!ok) return;
    }
    onClose();
  }

  const current = SUGGESTION_STATUS[item.status];

  const content = (
    <Stack gap={space.x5}>
      <View style={{ gap: space.x2 }}>
        <View style={s.badges}>
          <Badge tone={current.tone}>{current.label}</Badge>
          <Badge tone="gray">{item.categoryLabel}</Badge>
        </View>
        <Text variant="t7-bold">{item.title}</Text>
        <Text variant="t4-regular" color="neutralSubtle">
          {`${item.student.name} · ${item.student.grade} · ${formatDecidedAt(item.createdAt)}`}
        </Text>
      </View>

      <View style={s.content}>
        <Text variant="t5-regular" selectable>
          {item.content}
        </Text>
      </View>

      <View style={{ gap: space.x2 }}>
        <Text variant="t5-medium">처리 상태</Text>
        <ChipGroup>
          {SUGGESTION_STATUS_ORDER.map((value) => (
            <Chip key={value} selected={status === value} onPress={() => setStatus(value)} disabled={saving}>
              {SUGGESTION_STATUS[value].label}
            </Chip>
          ))}
        </ChipGroup>
      </View>

      <TextField
        label="답변"
        indicator="선택"
        value={reply}
        onChangeText={setReply}
        placeholder="학생에게 처리 결과를 알려 주세요"
        multiline
        minHeight={140}
        maxLength={MAX_REPLY}
        showCount
        editable={!saving}
        description="학생 앱·포털의 건의함에 그대로 보여요."
      />

      {item.handledByName && item.handledAt ? (
        <Text variant="t3-regular" color="neutralSubtle">
          {`마지막 처리 · ${item.handledByName} · ${formatDecidedAt(item.handledAt)}`}
        </Text>
      ) : null}
    </Stack>
  );

  const saveButton = (
    <Button
      variant="primary"
      size="lg"
      block
      loading={saving}
      disabled={!dirty}
      onPress={() => void save()}
      style={{ flex: 1 }}>
      저장
    </Button>
  );

  if (inline) {
    return (
      <DetailPanel title="건의사항" onClose={() => void close()} footer={saveButton} surface="panel">
        {content}
      </DetailPanel>
    );
  }

  return (
    <FullSheet visible onClose={() => void close()} title="건의사항" footer={saveButton}>
      {content}
    </FullSheet>
  );
}

export function SuggestionListSkeleton() {
  return (
    <Section>
      <View style={{ gap: space.x5 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ gap: space.x2 }}>
            <View style={{ flexDirection: 'row', gap: space.x1 }}>
              <Skeleton style={{ width: 40, height: 20 }} />
              <Skeleton style={{ width: 32, height: 20 }} />
            </View>
            <Skeleton style={{ width: '70%', height: 18 }} />
            <Skeleton style={{ width: '95%', height: 14 }} />
          </View>
        ))}
      </View>
    </Section>
  );
}

const s = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x1 },
  content: {
    backgroundColor: color.bg.layerFill,
    borderRadius: radius.r3,
    padding: space.x4,
  },
});
