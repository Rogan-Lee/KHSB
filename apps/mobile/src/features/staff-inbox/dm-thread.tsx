import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, ErrorState, Screen, Skeleton, Text, color, radius, space, toast } from '@/design';
// 채팅(ChatThread)과 같은 날짜 구분선·작성창·시각 표기를 쓴다 (S3 공용 조각)
import { dayKey, dayLabel, formatClock } from '@/features/student-comm/format';
import { DaySeparator, MessageComposer } from '@/features/student-comm/message-parts';
import {
  sendStaffDm,
  staffInboxPaths,
  type StaffDmMessage,
  type StaffDmThreadResponse,
} from '@/lib/api/staff-inbox';
import { refreshBadges } from '@/lib/badges';
import { useMobileQuery } from '@/lib/mobile-api';

import { DetailPanel, errorText } from './ui';

const POLL_MS = 10_000;
const GROUP_WINDOW_MS = 60_000;

type Bubble = StaffDmMessage & { sending?: boolean };

type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'msg'; key: string; m: Bubble; showAvatar: boolean; showTime: boolean; gap: number };

/** 1분 안에 같은 사람이 보낸 메시지는 묶고, 시각은 묶음의 마지막에만. inverted 목록용(최신이 앞) */
function buildRows(messages: Bubble[]): Row[] {
  const rows: Row[] = [];
  let currentDay = '';
  messages.forEach((m, i) => {
    const dk = dayKey(m.createdAt);
    const firstOfDay = dk !== currentDay;
    if (firstOfDay) {
      rows.push({ kind: 'day', key: `day-${dk}`, label: dayLabel(m.createdAt) });
      currentDay = dk;
    }
    const t = Date.parse(m.createdAt);
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const sameAsPrev = !firstOfDay && !!prev && prev.mine === m.mine && t - Date.parse(prev.createdAt) < GROUP_WINDOW_MS;
    const sameAsNext =
      !!next && next.mine === m.mine && dayKey(next.createdAt) === dk && Date.parse(next.createdAt) - t < GROUP_WINDOW_MS;
    rows.push({
      kind: 'msg',
      key: m.id,
      m,
      showAvatar: !sameAsPrev,
      showTime: !sameAsNext,
      gap: firstOfDay ? 0 : sameAsPrev ? space.x1 : space.x1 + space.x2_5,
    });
  });
  return rows.reverse();
}

/**
 * 직원 1:1 대화 — 폰은 라우트(/(staff)/dm/[userId]) 로 push, 태블릿은 소통 탭 오른쪽 패널(inline).
 * 채팅과 같은 말풍선·작성창. 열려 있는 동안 10초마다 새 메시지를 확인한다.
 * 키보드 회피는 바깥 Screen 이 한다.
 */
export function DmThread({
  userId,
  inline = false,
  onClose,
  onChanged,
}: {
  userId: string;
  inline?: boolean;
  onClose?: () => void;
  /** 보냈거나 새 메시지를 읽어서 목록이 바뀌면 */
  onChanged?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { data, error, isLoading, refresh, retry } = useMobileQuery<StaffDmThreadResponse>(
    staffInboxPaths.dmThread(userId),
  );
  const [draft, setDraft] = useState('');
  const [outbox, setOutbox] = useState<Bubble | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Row>>(null);

  // 화면이 보이고 앱이 켜져 있을 때만 새 메시지 확인 (조회 = 읽음 처리라서)
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh, isFocused]);

  // 조회 = 읽음 처리 → 메시지가 늘어날 때마다 배지·목록 갱신
  const count = data?.messages.length;
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  });
  useEffect(() => {
    if (count == null) return;
    refreshBadges();
    onChangedRef.current?.();
  }, [count]);

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft('');
    setOutbox({ id: `local-${Date.now()}`, content, mine: true, createdAt: new Date().toISOString(), sending: true });
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    try {
      await sendStaffDm(userId, content);
      await refresh();
    } catch (e) {
      setDraft((cur) => (cur ? `${content}\n${cur}` : content));
      toast(errorText(e, '메시지를 보내지 못했어요'), 'error');
    } finally {
      setOutbox(null);
      setSending(false);
    }
  }

  const other = data?.other;
  const rows = useMemo(
    () => buildRows(outbox ? [...(data?.messages ?? []), outbox] : (data?.messages ?? [])),
    [data, outbox],
  );

  let body: React.ReactNode;
  if (isLoading && !data) body = <ThreadSkeleton />;
  else if (error && !data) {
    body = (
      <View style={s.fill}>
        <ErrorState message={error} onRetry={() => void retry()} />
      </View>
    );
  } else if (rows.length === 0) {
    body = (
      <Pressable style={s.empty} onPress={Keyboard.dismiss} accessible={false}>
        {other ? <Avatar name={other.name} size={56} /> : null}
        <Text variant="t6-bold" align="center" style={{ marginTop: space.x4 }}>
          {other ? `${other.name} ${other.roleLabel}님께\n메시지를 보내 보세요` : '메시지를 보내 보세요'}
        </Text>
        <Text variant="t4-regular" color="neutralSubtle" align="center" style={{ marginTop: space.x1_5 }}>
          운영진끼리만 보이는 대화예요.
        </Text>
      </Pressable>
    );
  } else {
    body = (
      <FlatList
        ref={listRef}
        style={s.fill}
        data={rows}
        inverted
        keyExtractor={(r) => r.key}
        renderItem={({ item }) =>
          item.kind === 'day' ? (
            <DaySeparator label={item.label} />
          ) : (
            <DmBubble row={item} partnerName={other?.name ?? ''} />
          )
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.listContent}
        ListFooterComponent={
          other ? (
            <View style={s.intro}>
              <Avatar name={other.name} size={48} />
              <Text variant="t5-bold" style={{ marginTop: space.x2 }}>
                {other.name}
              </Text>
              <Text variant="t3-regular" color="neutralSubtle">
                {`${other.roleLabel} · 운영진끼리만 보이는 대화예요`}
              </Text>
            </View>
          ) : null
        }
      />
    );
  }

  const content = (
    <View style={s.root}>
      {body}
      <MessageComposer
        value={draft}
        onChangeText={setDraft}
        onSend={() => void send()}
        sending={sending}
        disabled={!data}
        placeholder="메시지 보내기"
        bottomInset={inline ? 0 : insets.bottom}
      />
    </View>
  );

  const title = other?.name ?? '메시지';

  if (inline) {
    return (
      <DetailPanel title={title} onClose={onClose} scroll={false}>
        {content}
      </DetailPanel>
    );
  }

  return (
    <Screen kind="push" title={title} scroll={false} backFallback="/(staff)/(tabs)/inbox">
      {content}
    </Screen>
  );
}

function DmBubble({ row, partnerName }: { row: Extract<Row, { kind: 'msg' }>; partnerName: string }) {
  const { m, showAvatar, showTime } = row;
  const time = showTime ? (
    <Text variant="t2-regular" color="placeholder" tabular style={s.time}>
      {m.sending ? '보내는 중' : formatClock(m.createdAt)}
    </Text>
  ) : null;

  if (m.mine) {
    return (
      <View style={[s.rowMine, { paddingTop: row.gap }, m.sending && { opacity: 0.55 }]}>
        {time}
        <View style={[s.bubble, s.bubbleMine, showTime && { borderBottomRightRadius: radius.r1_5 }]}>
          <Text variant="t5-regular" color="staticWhite" selectable>
            {m.content}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.rowTheirs, { paddingTop: row.gap }]}>
      {showAvatar ? <Avatar name={partnerName || '?'} size={32} /> : <View style={{ width: 32 }} />}
      <View style={s.theirsLine}>
        <View style={[s.bubble, s.bubbleTheirs, showAvatar && { borderTopLeftRadius: radius.r1_5 }]}>
          <Text variant="t5-regular" selectable>
            {m.content}
          </Text>
        </View>
        {time}
      </View>
    </View>
  );
}

function ThreadSkeleton() {
  return (
    <View style={[s.fill, s.skeleton]} accessibilityLabel="대화를 불러오는 중">
      <View style={{ flexDirection: 'row', gap: space.x2 }}>
        <Skeleton style={{ width: 32, height: 32, borderRadius: 16 }} />
        <Skeleton style={{ width: 180, height: 40, borderRadius: radius.r5 }} />
      </View>
      <Skeleton style={{ alignSelf: 'flex-end', width: 150, height: 40, borderRadius: radius.r5 }} />
      <Skeleton style={{ alignSelf: 'flex-end', width: 210, height: 62, borderRadius: radius.r5 }} />
      <View style={{ flexDirection: 'row', gap: space.x2 }}>
        <Skeleton style={{ width: 32, height: 32, borderRadius: 16 }} />
        <Skeleton style={{ width: 230, height: 62, borderRadius: radius.r5 }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  root: { flex: 1, backgroundColor: color.bg.layerBasement },
  listContent: { paddingHorizontal: space.x4, paddingTop: space.x4, paddingBottom: space.x2 },
  intro: { alignItems: 'center', paddingTop: space.x6, paddingBottom: space.x2 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x6,
    paddingBottom: space.x10,
  },
  rowMine: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', gap: space.x1_5 },
  rowTheirs: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x2 },
  theirsLine: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-end', gap: space.x1_5 },
  bubble: {
    maxWidth: '75%',
    flexShrink: 1,
    borderRadius: radius.r5,
    paddingHorizontal: space.x3_5,
    paddingVertical: space.x2,
  },
  bubbleMine: { backgroundColor: color.bg.brandSolid },
  bubbleTheirs: { backgroundColor: color.bg.layerDefault },
  time: { paddingBottom: space.x0_5, flexShrink: 0 },
  skeleton: { paddingHorizontal: space.x4, paddingTop: space.x6, gap: space.x3 },
});
