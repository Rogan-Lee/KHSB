import { RotateCcw, Sparkles, Trash2, TriangleAlert } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  FullSheet,
  ListRow,
  Notice,
  Stack,
  Text,
  TextField,
  color,
  confirm,
  radius,
  space,
  toast,
} from '@/design';
import { formatDecidedAt, formatInboxTime } from '@/features/staff-inbox/time';
import { DetailPanel, errorText } from '@/features/staff-inbox/ui';
import {
  INSTRUCTION_MAX_LEN,
  discardInstructionDraft,
  mentionsParent,
  regenerateInstructionDraft,
  sendInstruction,
  type PendingParentRequest,
  type StaffInstruction,
} from '@/lib/api/instructions';
import { checkCommunication } from '@/lib/api/staff-ops';

const KIND_RE = /^\[([^\]]{1,10})\]\s*/;

/** "[학습] 수학 더 시켜 주세요" → 종류 "학습" · 본문 */
export function splitKind(content: string) {
  const m = KIND_RE.exec(content);
  return m ? { kind: m[1], text: content.slice(m[0].length) } : { kind: null, text: content };
}

/** 학생에게 보낼 지시 입력 — 글자 수 · 출처 안내 · 부모님 언급 경고 */
export function InstructionField({
  header,
  value,
  onChangeText,
  editable = true,
  placeholder,
}: {
  header?: ReactNode;
  value: string;
  onChangeText: (v: string) => void;
  editable?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={{ gap: space.x2 }}>
      {header != null ? <View style={s.row}>{header}</View> : null}
      <TextField
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline
        minHeight={120}
        maxLength={INSTRUCTION_MAX_LEN}
        showCount
        editable={editable}
        description="학생에게는 학부모 요청이라는 게 보이지 않아요. 보낸 사람 이름으로만 전달돼요."
      />
      {mentionsParent(value) ? (
        <Notice tone="warn" icon={TriangleAlert}>
          문장에 부모님을 떠올리게 하는 말이 있어요. 학생에게 그대로 보여요.
        </Notice>
      ) : null}
    </View>
  );
}

/** 보낸 지시 한 건 — 출처(학부모 요청 원문) · 보낸 사람 · 학생 확인 */
export function InstructionItem({ item, showStudent = false }: { item: StaffInstruction; showStudent?: boolean }) {
  const request = item.request ? { ...splitKind(item.request.content), by: item.request.createdByName } : null;
  return (
    <View style={{ gap: space.x2 }}>
      <View style={s.row}>
        {request ? <Badge tone="brand">학부모 요청</Badge> : <Badge tone="gray">바로 지시</Badge>}
        {item.ackedAt ? <Badge tone="ok">학생 확인</Badge> : <Badge tone="warn">확인 전</Badge>}
      </View>
      {showStudent ? <Text variant="t5-bold">{`${item.student.name} · ${item.student.grade}`}</Text> : null}
      <Text variant="t5-regular" selectable>
        {item.content}
      </Text>
      {request ? (
        <View style={s.quote}>
          <View style={s.row}>
            <Text variant="t3-bold" color="neutralMuted">
              {`학부모 요청 · ${request.by}`}
            </Text>
            {request.kind ? <Badge tone="gray">{request.kind}</Badge> : null}
          </View>
          <Text variant="t4-regular" color="neutralMuted" selectable>
            {request.text}
          </Text>
        </View>
      ) : null}
      <Text variant="t3-regular" color="neutralSubtle">
        {[
          item.sentByName ? `보낸 사람 ${item.sentByName}` : null,
          item.sentAt ? formatDecidedAt(item.sentAt) : null,
          item.ackedAt ? `학생 확인 ${formatDecidedAt(item.ackedAt)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </View>
  );
}

export function PendingRequestRow({
  item,
  selected,
  onPress,
}: {
  item: PendingParentRequest;
  selected: boolean;
  onPress: () => void;
}) {
  const { kind, text } = splitKind(item.content);
  return (
    <ListRow
      align="start"
      onPress={onPress}
      style={selected ? { backgroundColor: color.bg.neutralWeak } : undefined}
      meta={
        kind || item.draft ? (
          <>
            {kind ? <Badge tone="gray">{kind}</Badge> : null}
            {item.draft ? <Badge tone="violet">AI 초안</Badge> : null}
          </>
        ) : undefined
      }
      title={
        <Text variant="t5-medium" numberOfLines={2}>
          {text}
        </Text>
      }
      description={
        <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1}>
          {`${item.student.name} · ${item.student.grade} · ${item.createdByName} · ${formatInboxTime(item.createdAt)}`}
        </Text>
      }
    />
  );
}

/**
 * 학부모 요청 처리 — AI 초안을 고쳐 보내기 · 초안 다시 · 초안 버리기 · 확인만.
 * 폰은 전체 화면 시트, 태블릿은 오른쪽 패널(inline). onDone 은 요청이 목록에서 빠지는 처리 뒤.
 */
export function RequestDetail({
  item,
  inline = false,
  onClose,
  onDone,
  onChanged,
}: {
  item: PendingParentRequest;
  inline?: boolean;
  onClose: () => void;
  onDone: () => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(item.draft);
  const [text, setText] = useState(item.draft?.content ?? '');
  const [busy, setBusy] = useState<'send' | 'regen' | 'discard' | 'check' | null>(null);
  const { kind, text: original } = splitKind(item.content);
  const content = text.trim();
  const edited = content !== '' && content !== (draft?.content ?? '').trim();

  async function send() {
    if (!content || busy) return;
    setBusy('send');
    try {
      await sendInstruction({ studentId: item.student.id, content, requestId: item.id, draftId: draft?.id });
      toast(`${item.student.name} 학생에게 보냈어요`, 'success');
      onDone();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    if (busy) return;
    if (edited) {
      const ok = await confirm({
        title: 'AI 초안을 다시 만들까요?',
        message: '지금 고친 내용은 새 초안으로 바뀌어요.',
        confirmText: '다시 만들기',
      });
      if (!ok) return;
    }
    setBusy('regen');
    try {
      const { draft: next } = await regenerateInstructionDraft(item.id);
      setDraft(next);
      setText(next.content);
      toast('AI 초안을 새로 만들었어요', 'success');
      onChanged();
    } catch (e) {
      // 422 — 시킬 일이 없다고 본 경우도 서버 문구 그대로
      toast(errorText(e, 'AI 초안을 만들지 못했어요'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    if (!draft || busy) return;
    setBusy('discard');
    try {
      await discardInstructionDraft(draft.id);
      setDraft(null);
      setText('');
      toast('초안을 버렸어요', 'success');
      onChanged();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function checkOnly() {
    if (busy) return;
    const ok = await confirm({
      title: '지시 없이 확인만 할까요?',
      message: '학생에게는 아무것도 가지 않고, 이 요청은 처리한 걸로 바뀌어요.',
      confirmText: '확인만',
    });
    if (!ok) return;
    setBusy('check');
    try {
      await checkCommunication(item.student.id, item.id);
      toast('확인했어요', 'success');
      onDone();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function close() {
    if (edited && !busy) {
      const ok = await confirm({
        title: '보내지 않고 닫을까요?',
        message: '고친 내용이 사라져요.',
        confirmText: '닫기',
        destructive: true,
      });
      if (!ok) return;
    }
    onClose();
  }

  const body = (
    <Stack gap={space.x5}>
      <View style={{ gap: space.x2 }}>
        <View style={s.row}>
          <Badge tone="brand">학부모 요청</Badge>
          {kind ? <Badge tone="gray">{kind}</Badge> : null}
        </View>
        <Text variant="t7-bold">{`${item.student.name} · ${item.student.grade}`}</Text>
        <Text variant="t4-regular" color="neutralSubtle">
          {`${item.createdByName} · ${formatDecidedAt(item.createdAt)}`}
        </Text>
      </View>

      <View style={s.quote}>
        <Text variant="t5-regular" selectable>
          {original}
        </Text>
      </View>

      <InstructionField
        header={
          <>
            <Text variant="t5-medium">학생에게 보낼 지시</Text>
            {draft ? <Badge tone="violet">AI 초안</Badge> : null}
          </>
        }
        value={text}
        onChangeText={setText}
        editable={!busy}
        placeholder="학생에게 전할 말을 적어 주세요"
      />

      <View style={s.row}>
        <Button
          variant="weak"
          size="sm"
          icon={RotateCcw}
          loading={busy === 'regen'}
          disabled={!!busy}
          onPress={() => void regenerate()}>
          {draft ? 'AI 초안 다시' : 'AI 초안 만들기'}
        </Button>
        {draft ? (
          <Button
            variant="weak"
            size="sm"
            icon={Trash2}
            loading={busy === 'discard'}
            disabled={!!busy}
            onPress={() => void discard()}>
            초안 버리기
          </Button>
        ) : null}
      </View>
      {/* 생성형 AI 사전 고지 (인공지능기본법 제31조) — 웹 src/lib/ai-disclosure.ts 와 같은 문구 */}
      <Notice tone="gray" icon={Sparkles}>
        AI(Groq)로 초안을 만들어요. 이름은 가명으로 바꾸고 연락처는 빼고 보내요. 고쳐서 보내야 학생에게 전달돼요.
      </Notice>
    </Stack>
  );

  const footer = (
    <>
      <Button
        variant="weak"
        size="lg"
        loading={busy === 'check'}
        disabled={!!busy && busy !== 'check'}
        onPress={() => void checkOnly()}
        style={{ flex: 1 }}>
        확인만
      </Button>
      <Button
        variant="primary"
        size="lg"
        loading={busy === 'send'}
        disabled={!content || (!!busy && busy !== 'send')}
        onPress={() => void send()}
        style={{ flex: 2 }}>
        학생에게 보내기
      </Button>
    </>
  );

  if (inline) {
    return (
      <DetailPanel title="학부모 요청" onClose={() => void close()} footer={footer} surface="panel">
        {body}
      </DetailPanel>
    );
  }

  return (
    <FullSheet visible onClose={() => void close()} title="학부모 요청" footer={footer}>
      {body}
    </FullSheet>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.x1_5 },
  quote: {
    backgroundColor: color.bg.layerFill,
    borderRadius: radius.r3,
    padding: space.x4,
    gap: space.x1_5,
  },
});
