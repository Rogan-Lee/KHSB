import { useIsFocused } from 'expo-router';
import { ArrowDown, Users } from 'lucide-react-native';
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useComposerAttachments } from '@/components/chat-thread';
import {
  Avatar,
  Badge,
  ErrorState,
  IconTile,
  InTabsContext,
  Press,
  Skeleton,
  Text,
  color,
  radius,
  shadow,
  space,
  toast,
} from '@/design';
import { useSafetyMenu } from '@/features/safety/safety-menu';
import { dayKey, dayLabel, formatClock } from '@/features/student-comm/format';
import { BubbleAttachments, DaySeparator, MessageComposer } from '@/features/student-comm/message-parts';
import {
  familyChatPath,
  sendFamilyChatMessage,
  type FamilyAudience,
  type FamilyChatMembers,
  type FamilyChatMessage,
  type FamilyChatThreadResponse,
} from '@/lib/api/family-chat';
import { refreshBadges } from '@/lib/badges';
import { requestMobileApi, uploadMobileFamilyChatFile } from '@/lib/mobile-api';

const POLL_MS = 10_000;
const GROUP_WINDOW_MS = 60_000;

const MY_KIND = { parent: 'PARENT', student: 'STUDENT', staff: 'STAFF' } as const;

type ThreadState = {
  studentId: string;
  messages: FamilyChatMessage[];
  hasMore: boolean;
  members: FamilyChatMembers | null;
};

type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'system'; key: string; m: FamilyChatMessage }
  | {
      kind: 'msg';
      key: string;
      m: FamilyChatMessage;
      /** 묶음의 첫 글 — 상대면 아바타·이름 */
      first: boolean;
      /** 묶음의 마지막 글 — 시각 */
      last: boolean;
      gap: number;
      sending: boolean;
    };

const senderKey = (m: FamilyChatMessage) => (m.mine ? 'me' : `${m.senderKind}:${m.senderId}`);

function sameGroup(a: FamilyChatMessage | undefined, b: FamilyChatMessage | undefined) {
  return (
    !!a &&
    !!b &&
    a.senderKind !== 'SYSTEM' &&
    b.senderKind !== 'SYSTEM' &&
    senderKey(a) === senderKey(b) &&
    dayKey(a.createdAt) === dayKey(b.createdAt) &&
    Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) < GROUP_WINDOW_MS
  );
}

/** 같은 사람이 1분 안에 이어 쓴 글은 묶는다. inverted 목록용(최신이 앞) */
function buildRows(messages: FamilyChatMessage[], outbox: FamilyChatMessage | null): Row[] {
  const all = outbox ? [...messages, outbox] : messages;
  const rows: Row[] = [];
  let currentDay = '';
  all.forEach((m, i) => {
    const dk = dayKey(m.createdAt);
    const firstOfDay = dk !== currentDay;
    if (firstOfDay) {
      rows.push({ kind: 'day', key: `day-${dk}`, label: dayLabel(m.createdAt) });
      currentDay = dk;
    }
    if (m.senderKind === 'SYSTEM') {
      rows.push({ kind: 'system', key: m.id, m });
      return;
    }
    const withPrev = !firstOfDay && sameGroup(all[i - 1], m);
    rows.push({
      kind: 'msg',
      key: m.id,
      m,
      first: !withPrev,
      last: !sameGroup(m, all[i + 1]),
      gap: firstOfDay ? 0 : withPrev ? space.x1 : space.x1 + space.x2_5,
      sending: m === outbox,
    });
  });
  return rows.reverse();
}

/** 새로 받은 글을 붙인다 — 같은 id 는 거르고 시간순 (늦게 도착한 응답이 끼어도 순서 유지) */
function appendNew(prev: FamilyChatMessage[], incoming: FamilyChatMessage[]) {
  const ids = new Set(prev.map((m) => m.id));
  const fresh = incoming.filter((m) => !ids.has(m.id));
  if (fresh.length === 0) return prev;
  return [...prev, ...fresh].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** "홍길동 · 어머니 · 아버지 · 운영진" */
function memberLine(members: FamilyChatMembers) {
  return [members.student.name, ...members.parents.map((p) => p.name), '운영진'].join(' · ');
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export type FamilyChatThreadProps = {
  audience: FamilyAudience;
  /** 학부모·직원은 필수. 학생은 본인 방이라 응답에서 받는다 */
  studentId?: string | null;
  /** 작성창 아래 홈 인디케이터 여백 (기본: 탭 화면 밖이면 true) */
  bottomInset?: boolean;
  /** 멤버를 불러왔을 때 — 화면 제목에 쓴다 */
  onMembers?: (members: FamilyChatMembers) => void;
  /** 읽었거나 보냈을 때 — 목록 새로고침 */
  onActivity?: () => void;
};

/**
 * 가족 톡방 — 학생 · 학부모 · 운영진이 함께 보는 단체방. 학부모·학생·직원 앱이 같이 쓴다(경로만 다름).
 *  · 최신 페이지 → 위로 스크롤하면 이전 글, 화면이 보이는 동안 10초마다 새 글만(after) 받아 붙인다
 *  · 내 글 오른쪽, 다른 사람 왼쪽 + 이름, 자동 알림(입퇴실·리포트)은 가운데 회색 줄
 *  · 다른 사람 글을 길게 누르면 복사·신고·차단 (자동 알림·내 글은 메뉴 없음)
 * 키보드 회피는 바깥 `Screen scroll={false}` 가 한다.
 */
export function FamilyChatThread(props: FamilyChatThreadProps) {
  // 방이 바뀌면(자녀 전환) 상태를 통째로 새로
  return <ThreadInner key={`${props.audience}/${props.studentId ?? ''}`} {...props} />;
}

function ThreadInner({ audience, studentId = null, bottomInset, onMembers, onActivity }: FamilyChatThreadProps) {
  const insets = useSafeAreaInsets();
  const inTabs = useContext(InTabsContext);
  const isFocused = useIsFocused();

  const [thread, setThreadState] = useState<ThreadState | null>(null);
  const threadRef = useRef<ThreadState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [outbox, setOutbox] = useState<FamilyChatMessage | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background');
  const [newBelow, setNewBelow] = useState(false);

  const listRef = useRef<FlatList<Row>>(null);
  const inflight = useRef(false);
  const olderInflight = useRef(false);
  const atBottom = useRef(true);
  const alive = useRef(true);
  const callbacks = useRef({ onMembers, onActivity });
  useEffect(() => {
    callbacks.current = { onMembers, onActivity };
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const commit = useCallback((next: ThreadState) => {
    threadRef.current = next;
    setThreadState(next);
  }, []);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setNewBelow(false);
  }, []);

  /** 최신 페이지를 새로 받는다 (처음 · 차단 바뀐 뒤 · 빈 방). force: 진행 중 요청을 기다리지 않음 */
  const fetchLatest = useCallback(async (force = false) => {
    if (inflight.current && !force) return;
    inflight.current = true;
    try {
      const data = await requestMobileApi<FamilyChatThreadResponse>(familyChatPath(audience, studentId));
      if (!alive.current) return;
      const prev = threadRef.current;
      const members = data.members ?? prev?.members ?? null;
      commit({ studentId: data.studentId, messages: data.messages, hasMore: data.hasMore, members });
      setLoadError(null);
      // 조회 = 읽음 처리 — 빈 방을 주기적으로 다시 받을 때는 바뀐 게 없으면 조용히
      if (!prev || force || prev.messages.length !== data.messages.length) {
        refreshBadges();
        callbacks.current.onActivity?.();
      }
      if (!prev && members) callbacks.current.onMembers?.(members);
    } catch (error) {
      if (alive.current && threadRef.current == null) {
        setLoadError(errorMessage(error, '대화를 불러오지 못했어요'));
      }
    } finally {
      inflight.current = false;
    }
  }, [audience, studentId, commit]);

  /** 마지막으로 받은 글 이후만 받는다. force: 방금 보낸 글을 바로 받아 올 때 (진행 중 요청을 기다리지 않음) */
  const fetchNew = useCallback(
    async (force = false) => {
      const cur = threadRef.current;
      const last = cur?.messages[cur.messages.length - 1];
      if (!cur || !last) return fetchLatest(force);
      if (inflight.current && !force) return;
      inflight.current = true;
      try {
        const data = await requestMobileApi<FamilyChatThreadResponse>(
          familyChatPath(audience, studentId, { after: last.createdAt })
        );
        const latest = threadRef.current;
        if (!alive.current || !latest || data.messages.length === 0) return;
        const before = latest.messages;
        const messages = appendNew(before, data.messages);
        if (messages === before) return;
        commit({ ...latest, messages });
        const ids = new Set(before.map((m) => m.id));
        if (data.messages.some((m) => !m.mine && !ids.has(m.id))) {
          refreshBadges();
          callbacks.current.onActivity?.();
          if (!atBottom.current) setNewBelow(true);
        }
      } catch {
        // 다음 주기에 다시 확인
      } finally {
        inflight.current = false;
      }
    },
    [audience, studentId, commit, fetchLatest]
  );

  // 앱 전환 감지 — 백그라운드에선 확인 중단, 돌아오면 바로 확인
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAppActive(state !== 'background'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isFocused || !appActive) return;
    void fetchNew();
    const timer = setInterval(() => void fetchNew(), POLL_MS);
    return () => clearInterval(timer);
  }, [isFocused, appActive, fetchNew]);

  const loadOlder = useCallback(async () => {
    const cur = threadRef.current;
    const oldest = cur?.messages[0];
    if (!cur || !cur.hasMore || !oldest || olderInflight.current) return;
    olderInflight.current = true;
    setLoadingOlder(true);
    try {
      const data = await requestMobileApi<FamilyChatThreadResponse>(
        familyChatPath(audience, studentId, { before: oldest.createdAt })
      );
      const latest = threadRef.current;
      if (!alive.current || !latest) return;
      const ids = new Set(latest.messages.map((m) => m.id));
      commit({
        ...latest,
        messages: [...data.messages.filter((m) => !ids.has(m.id)), ...latest.messages],
        hasMore: data.hasMore,
      });
    } catch {
      toast('이전 대화를 불러오지 못했어요', 'error');
    } finally {
      olderInflight.current = false;
      if (alive.current) setLoadingOlder(false);
    }
  }, [audience, studentId, commit]);

  // ─── 첨부 · 전송 ───
  const roomStudentId = () => studentId ?? threadRef.current?.studentId ?? null;
  const files = useComposerAttachments((file) => {
    const id = roomStudentId();
    if (!id) throw new Error('잠시 후 다시 시도해 주세요');
    return uploadMobileFamilyChatFile(file, id);
  });

  const send = async () => {
    const content = draft.trim();
    if ((!content && files.pending.length === 0) || sending || files.uploading) return;
    const attachments = files.pending;
    setSending(true);
    setDraft('');
    files.clear();
    setOutbox({
      id: `local-${Date.now()}`,
      mine: true,
      senderKind: MY_KIND[audience],
      senderId: null,
      senderName: '',
      content,
      attachments,
      createdAt: new Date().toISOString(),
    });
    requestAnimationFrame(scrollToBottom);
    try {
      await sendFamilyChatMessage(audience, roomStudentId(), { content, attachments });
    } catch (error) {
      if (alive.current) {
        // 실패 — 쓰던 글·첨부를 되돌린다 (그 사이 새로 쓴 글이 있으면 뒤에 붙임)
        setDraft((cur) => (cur ? `${content}\n${cur}` : content));
        files.restore(attachments);
        toast(errorMessage(error, '메시지를 보내지 못했어요'), 'error');
        setOutbox(null);
        setSending(false);
      }
      return;
    }
    await fetchNew(true);
    callbacks.current.onActivity?.();
    if (alive.current) {
      setOutbox(null);
      setSending(false);
    }
  };

  // ─── 신고·차단 (다른 사람 글만) ───
  // 차단하면 그 사람 글이 빠지므로 최신 페이지부터 다시 받는다
  const safety = useSafetyMenu(() => void fetchLatest(true));
  const openMenu = (m: FamilyChatMessage) => {
    if (m.mine || m.senderKind === 'SYSTEM' || !m.senderId) return;
    safety.open({
      user: { type: m.senderKind, id: m.senderId, name: m.senderName },
      message: { type: 'FAMILY_CHAT_MESSAGE', id: m.id },
      copyText: m.content || undefined,
      // 차단한 사람 글은 서버가 빼고 주므로 보이는 글의 작성자는 차단 전이다
      blocked: false,
      groupChat: true,
    });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const bottom = e.nativeEvent.contentOffset.y < 80;
    atBottom.current = bottom;
    if (bottom && newBelow) setNewBelow(false);
  };

  const rows = useMemo(() => (thread ? buildRows(thread.messages, outbox) : []), [thread, outbox]);
  const bottomPad = (bottomInset ?? !inTabs) ? insets.bottom : 0;
  const members = thread?.members ?? null;

  let body: ReactNode;
  if (!thread && loadError) {
    body = (
      <View style={s.fill}>
        <ErrorState message={loadError} onRetry={() => void fetchLatest()} />
      </View>
    );
  } else if (!thread) {
    body = <ThreadSkeleton />;
  } else if (rows.length === 0) {
    body = (
      <Pressable style={s.empty} onPress={Keyboard.dismiss} accessible={false}>
        <IconTile icon={Users} tone="brand" size={56} round />
        <Text variant="t6-bold" align="center" style={{ marginTop: space.x4 }}>
          가족 톡방이에요
        </Text>
        <Text variant="t4-regular" color="neutralSubtle" align="center" style={{ marginTop: space.x1_5 }}>
          {'학생, 학부모, 운영진이 함께 보는 방이에요.\n입실·퇴실과 리포트 소식도 여기에 남아요.'}
        </Text>
      </Pressable>
    );
  } else {
    body = (
      <View style={s.fill}>
        <FlatList
          ref={listRef}
          data={rows}
          inverted
          keyExtractor={(r) => r.key}
          renderItem={({ item }) =>
            item.kind === 'day' ? (
              <DaySeparator label={item.label} />
            ) : item.kind === 'system' ? (
              <SystemLine m={item.m} />
            ) : (
              <Bubble row={item} onLongPress={() => openMenu(item.m)} />
            )
          }
          onEndReached={() => void loadOlder()}
          onEndReachedThreshold={0.4}
          onScroll={onScroll}
          scrollEventThrottle={64}
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.listContent}
          ListFooterComponent={
            thread.hasMore ? (
              <View style={s.olderLoading}>
                {loadingOlder ? <ActivityIndicator color={color.fg.neutralSubtle} /> : null}
              </View>
            ) : null
          }
        />
        {newBelow && (
          <Press onPress={scrollToBottom} style={s.newPill} accessibilityLabel="새 메시지 보기">
            <Text variant="t3-bold" color="staticWhite">
              새 메시지
            </Text>
            <ArrowDown color={color.palette.staticWhite} size={14} strokeWidth={2.6} />
          </Press>
        )}
      </View>
    );
  }

  return (
    <View style={s.root}>
      {members ? (
        <View style={s.members} accessibilityLabel={`참여: ${memberLine(members)}`}>
          <Users color={color.fg.neutralSubtle} size={16} strokeWidth={2.2} />
          <Text variant="t3-medium" color="neutralMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {memberLine(members)}
          </Text>
          {members.parents.length === 0 ? <Badge tone="warn">학부모 미연결</Badge> : null}
        </View>
      ) : null}
      {body}
      <MessageComposer
        value={draft}
        onChangeText={setDraft}
        onSend={() => void send()}
        sending={sending}
        uploading={files.uploading}
        disabled={!thread}
        attachments={files.attachments}
        onRemoveAttachment={files.remove}
        actions={files.actions}
        bottomInset={bottomPad}
      />
      {safety.element}
    </View>
  );
}

/** 자동 알림 — 가운데 회색 줄 (아바타·이름 없이) */
function SystemLine({ m }: { m: FamilyChatMessage }) {
  return (
    <View style={s.systemRow}>
      <View style={s.systemPill}>
        <Text variant="t3-regular" color="neutralMuted" align="center">
          {m.content}
        </Text>
      </View>
    </View>
  );
}

function Bubble({ row, onLongPress }: { row: Extract<Row, { kind: 'msg' }>; onLongPress: () => void }) {
  const { m, first, last, sending } = row;
  const time = last ? (
    <Text variant="t2-regular" color="placeholder" tabular style={s.time}>
      {sending ? '보내는 중' : formatClock(m.createdAt)}
    </Text>
  ) : null;
  const text = m.content ? (
    <View
      style={[
        s.bubble,
        m.mine
          ? [s.bubbleMine, last && { borderBottomRightRadius: radius.r1_5 }]
          : [s.bubbleTheirs, first && { borderTopLeftRadius: radius.r1_5 }],
      ]}>
      <Text variant="t5-regular" color={m.mine ? 'staticWhite' : 'neutral'} selectable={m.mine}>
        {m.content}
      </Text>
    </View>
  ) : null;

  if (m.mine) {
    return (
      <View style={[s.rowMine, { paddingTop: row.gap }, sending && { opacity: 0.55 }]}>
        {time}
        <View style={s.colMine}>
          <BubbleAttachments attachments={m.attachments} mine width={220} />
          {text}
        </View>
      </View>
    );
  }

  return (
    <View style={[s.rowTheirs, { paddingTop: row.gap }]}>
      {first ? <Avatar name={m.senderName} size={32} /> : <View style={{ width: 32 }} />}
      <View style={s.colTheirsOuter}>
        {first ? (
          <Text variant="t3-medium" color="neutralMuted" style={{ paddingHorizontal: space.x1 }}>
            {m.senderName}
          </Text>
        ) : null}
        <View style={s.theirsLine}>
          <Pressable
            onLongPress={onLongPress}
            delayLongPress={350}
            accessibilityHint="길게 누르면 복사·신고 메뉴가 열려요"
            style={s.colTheirs}>
            <BubbleAttachments attachments={m.attachments} mine={false} width={220} />
            {text}
          </Pressable>
          {time}
        </View>
      </View>
    </View>
  );
}

function ThreadSkeleton() {
  return (
    <View style={[s.fill, s.skeleton]} accessibilityLabel="대화를 불러오는 중">
      <Skeleton style={{ alignSelf: 'center', width: 200, height: 28, borderRadius: radius.full }} />
      <View style={{ flexDirection: 'row', gap: space.x2 }}>
        <Skeleton style={{ width: 32, height: 32, borderRadius: 16 }} />
        <Skeleton style={{ width: 180, height: 40, borderRadius: radius.r5 }} />
      </View>
      <Skeleton style={{ alignSelf: 'flex-end', width: 150, height: 40, borderRadius: radius.r5 }} />
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
  members: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x1_5,
    minHeight: 40,
    paddingHorizontal: space.x4,
    paddingVertical: space.x2,
    backgroundColor: color.bg.layerDefault,
    borderBottomWidth: 1,
    borderBottomColor: color.stroke.neutralSubtle,
  },
  listContent: { paddingHorizontal: space.x4, paddingTop: space.x4, paddingBottom: space.x2 },
  olderLoading: { height: 56, alignItems: 'center', justifyContent: 'center' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x6,
    paddingBottom: space.x10,
  },
  systemRow: { alignItems: 'center', paddingVertical: space.x2 },
  systemPill: {
    maxWidth: '85%',
    paddingHorizontal: space.x3,
    paddingVertical: space.x1_5,
    borderRadius: radius.r3,
    backgroundColor: color.bg.neutralWeak,
  },
  rowMine: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', gap: space.x1_5 },
  colMine: { maxWidth: '75%', flexShrink: 1, alignItems: 'flex-end', gap: space.x1 },
  rowTheirs: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x2 },
  colTheirsOuter: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: space.x1 },
  theirsLine: { flexDirection: 'row', alignItems: 'flex-end', gap: space.x1_5, width: '100%' },
  colTheirs: { maxWidth: '80%', flexShrink: 1, alignItems: 'flex-start', gap: space.x1 },
  bubble: {
    borderRadius: radius.r5,
    paddingHorizontal: space.x3_5,
    paddingVertical: space.x2,
    maxWidth: '100%',
  },
  bubbleMine: { backgroundColor: color.bg.brandSolid },
  bubbleTheirs: { backgroundColor: color.bg.layerDefault },
  time: { paddingBottom: space.x0_5, flexShrink: 0 },
  newPill: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: space.x3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x1,
    paddingHorizontal: space.x3_5,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: color.bg.neutralInverted,
    ...shadow('s2'),
  },
  skeleton: { paddingHorizontal: space.x4, paddingTop: space.x6, gap: space.x3 },
});
