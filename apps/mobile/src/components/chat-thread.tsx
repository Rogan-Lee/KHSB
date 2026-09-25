import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useIsFocused } from 'expo-router';
import { ArrowDown, Camera, ChevronLeft, FileText, Images } from 'lucide-react-native';
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  ErrorState,
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
import { dayKey, dayLabel, formatClock } from '@/features/student-comm/format';
import {
  BubbleAttachments,
  DaySeparator,
  MessageComposer,
  type ComposerAction,
} from '@/features/student-comm/message-parts';
import type { ChatMessageView, ChatPartnerView, ChatThreadView } from '@/lib/api/student-comm';
import { refreshBadges } from '@/lib/badges';
import {
  MobileAttachment,
  mutateMobileApi,
  requestMobileApi,
  uploadMobileChatFile,
} from '@/lib/mobile-api';

const MAX_ATTACHMENTS = 5;
const DEFAULT_POLL_MS = 5000;
const GROUP_WINDOW_MS = 60_000;

type UploadFileLike = Parameters<typeof uploadMobileChatFile>[0];

export type ChatThreadProps = {
  /** 예: '/api/mobile/v1/student/chats' | '/api/mobile/v1/staff/chats' */
  basePath: string;
  chatId: string;
  /** 내 말풍선 색 (기본 SEED 브랜드 주황) */
  accentColor?: string;
  /** 상대 정보 바의 뒤로가기 버튼 (폰 TwoPane 에서 목록으로) */
  onBack?: () => void;
  /** 상단 상대 정보 바 (기본 true). Screen 헤더가 이미 상대 이름을 보여주면 false */
  showPartnerBar?: boolean;
  /** 자체 키보드 회피 (기본 true). `Screen scroll={false}` 안에 넣으면 false — Screen 이 처리한다 */
  avoidKeyboard?: boolean;
  /** 작성창 아래 홈 인디케이터 여백 (기본: 탭 화면 밖이면 true) */
  bottomInset?: boolean;
  /** 새 메시지 확인 주기 ms (기본 5000). 화면이 보이고 앱이 켜져 있을 때만 확인 */
  pollIntervalMs?: number;
  /** 대화 정보를 불러왔을 때 — 화면 제목에 상대 이름을 쓰는 용도 */
  onLoaded?: (info: { chatId: string; partner: ChatPartnerView }) => void;
  /** 내가 보냈거나 새 메시지를 읽었을 때 — 목록 새로고침 용도 */
  onActivity?: () => void;
};

type ThreadState = { partner: ChatPartnerView; messages: ChatMessageView[]; hasMore: boolean };

type Row =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'msg';
      key: string;
      m: ChatMessageView;
      showAvatar: boolean;
      showTime: boolean;
      /** 같은 날 첫 메시지면 0, 보낸 사람이 바뀌면 넓게, 연속이면 촘촘하게 */
      gap: number;
      sending: boolean;
    };

/**
 * 최신 구간(폴링·전송 응답)을 기존 목록에 합친다.
 * 이미 불러온 이전 메시지는 유지하고, 늦게 도착한 응답이 모르는 더 새 메시지(방금 보낸 것 등)도 지우지 않는다.
 * (메시지는 삭제되지 않으므로 합집합이 항상 맞다)
 */
function mergeLatest(prev: ChatMessageView[], latest: ChatMessageView[]): ChatMessageView[] {
  if (prev.length === 0) return latest;
  if (latest.length === 0) return prev;
  const ids = new Set(latest.map((m) => m.id));
  const first = latest[0].createdAt;
  const last = latest[latest.length - 1].createdAt;
  const older = prev.filter((m) => !ids.has(m.id) && m.createdAt < first);
  const newer = prev.filter((m) => !ids.has(m.id) && m.createdAt > last);
  return older.length || newer.length ? [...older, ...latest, ...newer] : latest;
}

function buildRows(messages: ChatMessageView[], outbox: ChatMessageView | null): Row[] {
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
    const t = Date.parse(m.createdAt);
    const prev = i > 0 ? all[i - 1] : null;
    const next = i < all.length - 1 ? all[i + 1] : null;
    const sameAsPrev =
      !firstOfDay && !!prev && prev.mine === m.mine && t - Date.parse(prev.createdAt) < GROUP_WINDOW_MS;
    const sameAsNext =
      !!next &&
      next.mine === m.mine &&
      dayKey(next.createdAt) === dk &&
      Date.parse(next.createdAt) - t < GROUP_WINDOW_MS;
    rows.push({
      kind: 'msg',
      key: m.id,
      m,
      showAvatar: !sameAsPrev,
      showTime: !sameAsNext,
      gap: firstOfDay ? 0 : sameAsPrev ? space.x1 : space.x1 + space.x2_5,
      sending: m === outbox,
    });
  });
  // inverted 목록: 최신이 index 0
  return rows.reverse();
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * 학생·직원 공용 1:1 채팅 — 웹 학생 포털 대화 화면(ChatView portal)과 같은 SEED 말풍선.
 *  · 내 말풍선: 브랜드색 오른쪽 / 상대: 흰색 왼쪽 + 아바타, 1분 안 연속 메시지는 묶어서 시각은 마지막에만
 *  · 날짜 구분선, 사진(크게 보기)·영상·파일 첨부, 위로 스크롤하면 이전 대화 불러오기
 *  · 화면이 보이는 동안 5초마다 + 앱이 다시 켜질 때 새 메시지 확인 (조회 = 읽음 처리 → 탭 배지 갱신)
 *  · 보내는 중엔 흐리게 먼저 보여 주고, 실패하면 토스트 + 쓰던 글·첨부를 되돌린다
 */
export function ChatThread(props: ChatThreadProps) {
  // 대화방이 바뀌면 상태를 통째로 새로 (다른 방 메시지가 섞이지 않게)
  return <ChatThreadInner key={`${props.basePath}/${props.chatId}`} {...props} />;
}

function ChatThreadInner({
  basePath,
  chatId,
  accentColor = color.bg.brandSolid,
  onBack,
  showPartnerBar = true,
  avoidKeyboard = true,
  bottomInset,
  pollIntervalMs = DEFAULT_POLL_MS,
  onLoaded,
  onActivity,
}: ChatThreadProps) {
  const path = `${basePath}/${chatId}`;
  const insets = useSafeAreaInsets();
  const inTabs = useContext(InTabsContext);
  const isFocused = useIsFocused();

  const [thread, setThreadState] = useState<ThreadState | null>(null);
  const threadRef = useRef<ThreadState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<MobileAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [sending, setSending] = useState(false);
  const [outbox, setOutbox] = useState<ChatMessageView | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background');
  const [newBelow, setNewBelow] = useState(false);

  const listRef = useRef<FlatList<Row>>(null);
  const inflight = useRef(false);
  const olderInflight = useRef(false);
  const atBottom = useRef(true);
  const alive = useRef(true);
  const callbacks = useRef({ onLoaded, onActivity });
  useEffect(() => {
    callbacks.current = { onLoaded, onActivity };
  });

  const commit = useCallback((next: ThreadState | null) => {
    threadRef.current = next;
    setThreadState(next);
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    listRef.current?.scrollToOffset({ offset: 0, animated });
    setNewBelow(false);
  }, []);

  const fetchLatest = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const data = await requestMobileApi<ChatThreadView>(path);
      if (!alive.current) return;
      const prev = threadRef.current;
      const prevIds = new Set(prev?.messages.map((m) => m.id));
      const messages = mergeLatest(prev?.messages ?? [], data.messages);
      const freshFromPartner = prev != null && data.messages.some((m) => !m.mine && !prevIds.has(m.id));
      const keptOlder = !!prev && prev.messages.length > 0 && prev.messages[0].createdAt < (data.messages[0]?.createdAt ?? '');
      commit({
        partner: data.partner,
        messages,
        hasMore: keptOlder && prev ? prev.hasMore : !!data.hasMore,
      });
      setLoadError(null);
      if (prev == null) {
        // 첫 조회 = 서버에서 읽음 처리됨
        refreshBadges();
        callbacks.current.onLoaded?.({ chatId: data.chatId, partner: data.partner });
      } else if (freshFromPartner) {
        refreshBadges();
        callbacks.current.onActivity?.();
        if (!atBottom.current) setNewBelow(true);
      }
    } catch (error) {
      if (alive.current && threadRef.current == null) {
        setLoadError(errorMessage(error, '대화를 불러오지 못했어요'));
      }
    } finally {
      inflight.current = false;
    }
  }, [path, commit]);

  // 앱 전환 감지 — 백그라운드에선 확인 중단, 돌아오면 바로 확인
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAppActive(state !== 'background'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isFocused || !appActive) return;
    void fetchLatest();
    const timer = setInterval(() => void fetchLatest(), Math.max(2000, pollIntervalMs));
    return () => clearInterval(timer);
  }, [isFocused, appActive, fetchLatest, pollIntervalMs]);

  const loadOlder = useCallback(async () => {
    const cur = threadRef.current;
    const oldest = cur?.messages[0];
    if (!cur || !cur.hasMore || !oldest || olderInflight.current) return;
    olderInflight.current = true;
    setLoadingOlder(true);
    try {
      const data = await requestMobileApi<ChatThreadView>(
        `${path}?before=${encodeURIComponent(oldest.createdAt)}`
      );
      const latest = threadRef.current;
      if (!alive.current || !latest) return;
      const ids = new Set(latest.messages.map((m) => m.id));
      commit({
        ...latest,
        messages: [...data.messages.filter((m) => !ids.has(m.id)), ...latest.messages],
        hasMore: !!data.hasMore,
      });
    } catch {
      toast('이전 대화를 불러오지 못했어요', 'error');
    } finally {
      olderInflight.current = false;
      if (alive.current) setLoadingOlder(false);
    }
  }, [path, commit]);

  // ─── 첨부 ───
  const room = MAX_ATTACHMENTS - pending.length - uploading;

  const uploadFiles = async (files: UploadFileLike[]) => {
    if (files.length === 0) return;
    if (room <= 0) {
      toast(`첨부는 ${MAX_ATTACHMENTS}개까지 보낼 수 있어요`, 'error');
      return;
    }
    const picked = files.slice(0, room);
    if (picked.length < files.length) {
      toast(`첨부는 ${MAX_ATTACHMENTS}개까지라 ${picked.length}개만 넣었어요`);
    }
    setUploading((n) => n + picked.length);
    await Promise.all(
      picked.map(async (file) => {
        try {
          const up = await uploadMobileChatFile(file, chatId);
          if (!alive.current) return;
          setPending((prev) => [
            ...prev,
            { mimeType: up.mimeType, name: up.name, sizeBytes: up.sizeBytes, url: up.url },
          ]);
        } catch (error) {
          toast(errorMessage(error, `${file.name}을(를) 올리지 못했어요`), 'error');
        } finally {
          if (alive.current) setUploading((n) => n - 1);
        }
      })
    );
  };

  const pickImages = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, room),
        quality: 0.6, // HEIC → JPEG 재인코딩·압축으로 업로드 시간 단축
      });
      if (res.canceled) return;
      await uploadFiles(
        res.assets.map((a, i) => ({
          uri: a.uri,
          name: a.fileName ?? `photo-${Date.now()}-${i + 1}.jpg`,
          mimeType: a.mimeType ?? 'image/jpeg',
          width: a.width,
          file: a.file,
        }))
      );
    } catch {
      toast('사진을 불러오지 못했어요', 'error');
    }
  };

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        toast('카메라 권한을 허용하면 바로 찍어서 보낼 수 있어요', 'error');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      await uploadFiles([
        {
          uri: a.uri,
          name: a.fileName ?? `photo-${Date.now()}.jpg`,
          mimeType: a.mimeType ?? 'image/jpeg',
          width: a.width,
          file: a.file,
        },
      ]);
    } catch {
      toast('카메라를 열지 못했어요', 'error');
    }
  };

  const pickDocuments = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: '*/*',
      });
      if (res.canceled) return;
      await uploadFiles(
        res.assets.map((a) => ({
          uri: a.uri,
          name: a.name,
          mimeType: a.mimeType ?? undefined,
          file: a.file,
        }))
      );
    } catch {
      toast('파일을 불러오지 못했어요', 'error');
    }
  };

  const actions: ComposerAction[] = [
    { key: 'album', label: '앨범', icon: Images, onPress: () => void pickImages() },
    { key: 'camera', label: '카메라', icon: Camera, onPress: () => void takePhoto() },
    { key: 'file', label: '파일', icon: FileText, onPress: () => void pickDocuments() },
  ];

  // ─── 전송 ───
  const send = async () => {
    const content = draft.trim();
    if ((!content && pending.length === 0) || sending || uploading > 0) return;
    const attachments = pending;
    setSending(true);
    setDraft('');
    setPending([]);
    setOutbox({
      id: `local-${Date.now()}`,
      mine: true,
      senderType: threadRef.current?.messages.find((m) => m.mine)?.senderType ??
        (basePath.includes('/staff/') ? 'STAFF' : 'STUDENT'),
      content,
      attachments,
      createdAt: new Date().toISOString(),
    });
    requestAnimationFrame(() => scrollToBottom(true));
    try {
      const data = await mutateMobileApi<ChatThreadView>(path, 'POST', { content, attachments });
      if (!alive.current) return;
      const prev = threadRef.current;
      commit({
        partner: data.partner,
        messages: mergeLatest(prev?.messages ?? [], data.messages),
        hasMore: prev?.hasMore ?? !!data.hasMore,
      });
      callbacks.current.onActivity?.();
    } catch (error) {
      if (!alive.current) return;
      // 실패 — 쓰던 글·첨부를 되돌린다 (그 사이 새로 쓴 글이 있으면 뒤에 붙임)
      setDraft((cur) => (cur ? `${content}\n${cur}` : content));
      setPending((cur) => [...attachments, ...cur].slice(0, MAX_ATTACHMENTS));
      toast(errorMessage(error, '메시지를 보내지 못했어요'), 'error');
    } finally {
      if (alive.current) {
        setOutbox(null);
        setSending(false);
      }
    }
  };

  const rows = useMemo(() => (thread ? buildRows(thread.messages, outbox) : []), [thread, outbox]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const bottom = e.nativeEvent.contentOffset.y < 80;
    atBottom.current = bottom;
    if (bottom && newBelow) setNewBelow(false);
  };

  // ─── 렌더 ───
  const partner = thread?.partner;
  const bottomPad = (bottomInset ?? !inTabs) ? insets.bottom : 0;

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
      <Pressable style={s.emptyWrap} onPress={Keyboard.dismiss} accessible={false}>
        <Avatar name={thread.partner.name} size={56} />
        <Text variant="t6-bold" align="center" style={{ marginTop: space.x4 }}>
          {thread.partner.name}
          {thread.partner.roleLabel && thread.partner.role !== 'STUDENT' ? ` ${thread.partner.roleLabel}` : ''}님께
          {'\n'}메시지를 보내보세요
        </Text>
        <Text variant="t4-regular" color="neutralSubtle" align="center" style={{ marginTop: space.x1_5 }}>
          질문이나 도움이 필요한 내용을{'\n'}편하게 남겨 주세요.
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
            ) : (
              <ChatBubble row={item} partnerName={thread.partner.name} accent={accentColor} />
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
          // inverted: paddingTop = 화면 아래쪽, paddingBottom = 화면 위쪽
          contentContainerStyle={s.listContent}
          ListFooterComponent={
            thread.hasMore ? (
              <View style={s.olderLoading}>
                {loadingOlder ? <ActivityIndicator color={color.fg.neutralSubtle} /> : null}
              </View>
            ) : (
              <PartnerIntro partner={thread.partner} />
            )
          }
        />
        {newBelow && (
          <Press onPress={() => scrollToBottom(true)} style={s.newPill} accessibilityLabel="새 메시지 보기">
            <Text variant="t3-bold" color="staticWhite">
              새 메시지
            </Text>
            <ArrowDown color={color.palette.staticWhite} size={14} strokeWidth={2.6} />
          </Press>
        )}
      </View>
    );
  }

  const content = (
    <View style={s.root}>
      {showPartnerBar && (
        <View style={s.partnerBar}>
          {onBack ? (
            <Press onPress={onBack} scale={0} pressedBg hitSlop={6} accessibilityLabel="뒤로 가기" style={s.backBtn}>
              <ChevronLeft color={color.fg.neutral} size={26} strokeWidth={2.1} />
            </Press>
          ) : null}
          {partner ? (
            <>
              <Avatar name={partner.name} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="t5-bold" numberOfLines={1}>
                  {partner.name}
                </Text>
                <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1}>
                  {partner.roleLabel}
                </Text>
              </View>
            </>
          ) : (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.x2_5 }}>
              <Skeleton style={{ width: 36, height: 36, borderRadius: 18 }} />
              <Skeleton style={{ width: 96, height: 16 }} />
            </View>
          )}
        </View>
      )}
      {body}
      <MessageComposer
        value={draft}
        onChangeText={setDraft}
        onSend={() => void send()}
        sending={sending}
        uploading={uploading > 0}
        disabled={!thread}
        attachments={pending.map((a, i) => ({
          key: `${a.url}-${i}`,
          name: a.name,
          mimeType: a.mimeType,
          uri: a.url,
        }))}
        onRemoveAttachment={(key) => setPending((prev) => prev.filter((a, i) => `${a.url}-${i}` !== key))}
        actions={actions}
        bottomInset={bottomPad}
      />
    </View>
  );

  if (!avoidKeyboard) return content;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.fill}>
      {content}
    </KeyboardAvoidingView>
  );
}

function PartnerIntro({ partner }: { partner: ChatPartnerView }) {
  return (
    <View style={s.intro}>
      <Avatar name={partner.name} size={48} />
      <Text variant="t5-bold" style={{ marginTop: space.x2 }}>
        {partner.name}
      </Text>
      {partner.roleLabel ? (
        <Text variant="t3-regular" color="neutralSubtle">
          {partner.roleLabel}
        </Text>
      ) : null}
    </View>
  );
}

function ChatBubble({
  row,
  partnerName,
  accent,
}: {
  row: Extract<Row, { kind: 'msg' }>;
  partnerName: string;
  accent: string;
}) {
  const { m, showAvatar, showTime, sending } = row;
  const time = showTime ? (
    <Text variant="t2-regular" color="placeholder" tabular style={s.time}>
      {sending ? '보내는 중' : formatClock(m.createdAt)}
    </Text>
  ) : null;
  const bubble = m.content ? (
    <View
      style={[
        s.bubble,
        m.mine
          ? [{ backgroundColor: accent }, showTime && { borderBottomRightRadius: radius.r1_5 }]
          : [s.bubbleTheirs, showAvatar && { borderTopLeftRadius: radius.r1_5 }],
      ]}>
      <Text variant="t5-regular" color={m.mine ? 'staticWhite' : 'neutral'} selectable>
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
          {bubble}
        </View>
      </View>
    );
  }

  const name = m.senderName || partnerName;
  return (
    <View style={[s.rowTheirs, { paddingTop: row.gap }]}>
      {showAvatar ? <Avatar name={name} size={32} /> : <View style={{ width: 32 }} />}
      <View style={s.colTheirsOuter}>
        {showAvatar && name !== partnerName ? (
          <Text variant="t3-medium" color="neutralMuted" style={{ paddingHorizontal: space.x1 }}>
            {name}
          </Text>
        ) : null}
        <View style={s.theirsLine}>
          <View style={s.colTheirs}>
            <BubbleAttachments attachments={m.attachments} mine={false} width={220} />
            {bubble}
          </View>
          {time}
        </View>
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
  partnerBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2_5,
    paddingLeft: space.x2,
    paddingRight: space.x4,
    backgroundColor: color.bg.layerDefault,
    borderBottomWidth: 1,
    borderBottomColor: color.stroke.neutralSubtle,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: space.x4, paddingTop: space.x4, paddingBottom: space.x2 },
  olderLoading: { height: 56, alignItems: 'center', justifyContent: 'center' },
  intro: { alignItems: 'center', paddingTop: space.x6, paddingBottom: space.x2 },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x6,
    paddingBottom: space.x10,
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
