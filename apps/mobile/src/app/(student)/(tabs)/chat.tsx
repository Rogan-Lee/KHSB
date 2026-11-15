import type { Href } from 'expo-router';
import { MessageCircle, Users } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ChatThread } from '@/components/chat-thread';
import { TwoPane } from '@/components/two-pane';
import {
  Avatar,
  Badge,
  CountBadge,
  EmptyState,
  ErrorState,
  IconTile,
  ListRow,
  Screen,
  Section,
  Skeleton,
  Stack,
  Text,
  color,
  space,
  useMasterDetail,
  useResponsive,
} from '@/design';
import { FamilyChatThread } from '@/features/family-chat/thread';
import { formatAgo } from '@/features/student-comm/format';
import { useLiveRefresh } from '@/features/student-comm/live-refresh';
import { FAMILY_PEEK, familyChatPath, type FamilyChatThreadResponse } from '@/lib/api/family-chat';
import { STUDENT_CHATS_PATH, type StudentChatItem, type StudentChatList } from '@/lib/api/student-comm';
import { useStudentBadges } from '@/lib/badges';
import { useMobileQuery } from '@/lib/mobile-api';

/** 목록에서 가족 톡방을 가리키는 id (채팅방 id 와 겹치지 않는다) */
const FAMILY_ID = 'family';
const chatHref = (id: string) => (id === FAMILY_ID ? '/(student)/family-chat' : `/(student)/chat/${id}`) as Href;
const FAMILY_PEEK_PATH = familyChatPath('student', null, FAMILY_PEEK);

/** 메시지 탭 — 맨 위 가족 톡방 + 웹 학생 포털 /s/[token]/chat 과 같은 구성 (담당 선생님 / 이전 담당자). 태블릿은 목록 + 오른쪽 대화. */
export default function StudentChatTab() {
  const { data, error, isRefreshing, refresh, retry } = useMobileQuery<StudentChatList>(STUDENT_CHATS_PATH);
  // 가족 톡방 미리보기 — 읽음 처리 없이 최신 글. 15초 주기에는 넣지 않고 화면 복귀·안 읽은 수가 바뀔 때만 (egress)
  const family = useMobileQuery<FamilyChatThreadResponse>(FAMILY_PEEK_PATH);
  const familyUnread = useStudentBadges().familyChat ?? 0;
  const md = useMasterDetail(chatHref);
  const { width } = useResponsive();

  // 새 메시지·미확인 수 반영 (15초, 앱 복귀 시 즉시)
  useLiveRefresh(retry, 15_000);
  const reloadFamily = family.retry;
  const seenUnread = useRef(familyUnread);
  useEffect(() => {
    if (seenUnread.current === familyUnread) return;
    seenUnread.current = familyUnread;
    void reloadFamily();
  }, [familyUnread, reloadFamily]);

  const refreshAll = () => {
    void refresh();
    void family.refresh();
  };

  const familyRow = (
    <FamilyRow
      last={family.data?.messages.at(-1) ?? null}
      unread={md.selectedId === FAMILY_ID ? 0 : familyUnread}
      selected={md.selectedId === FAMILY_ID}
      onPress={() => md.open(FAMILY_ID)}
    />
  );

  const body = !data ? (
    error ? (
      <ErrorState message={error} onRetry={() => void retry()} />
    ) : (
      <ChatListSkeleton />
    )
  ) : (
    <ChatList chats={data.chats} selectedId={md.selectedId} onOpen={md.open} top={familyRow} />
  );

  if (!md.isTablet) {
    return (
      <Screen kind="tab" title="메시지" refreshing={isRefreshing} onRefresh={refreshAll}>
        {body}
      </Screen>
    );
  }

  return (
    <Screen kind="tab" title="메시지" scroll={false} maxWidth={0}>
      <TwoPane
        // iPad mini 세로(744)에서도 대화 패널이 좁지 않도록 목록은 폭의 40% · 320~380
        masterWidth={Math.round(Math.min(380, Math.max(320, width * 0.4)))}
        master={
          <ScrollView
            contentContainerStyle={s.master}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={refreshAll}
                tintColor={color.fg.neutralSubtle}
                colors={[color.fg.brand]}
              />
            }>
            {body}
          </ScrollView>
        }
        detail={
          md.selectedId === FAMILY_ID ? (
            <FamilyChatThread audience="student" onActivity={() => void family.retry()} />
          ) : md.selectedId ? (
            <ChatThread
              basePath={STUDENT_CHATS_PATH}
              chatId={md.selectedId}
              avoidKeyboard={false}
              onActivity={() => void retry()}
              onLoaded={() => void retry()}
            />
          ) : null
        }
        detailVisible={!!md.selectedId}
        onCloseDetail={md.close}
        emptyTitle="대화를 선택하세요"
        emptyMessage="왼쪽에서 선생님을 고르면 여기서 바로 대화할 수 있어요."
      />
    </Screen>
  );
}

function ChatList({
  chats,
  selectedId,
  onOpen,
  top,
}: {
  chats: StudentChatItem[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  /** 맨 위 고정 행 (가족 톡방) */
  top: React.ReactNode;
}) {
  if (chats.length === 0) {
    return (
      <Stack>
        {top}
        <Section>
          <EmptyState
            icon={MessageCircle}
            title="아직 배정된 담당자가 없어요"
            description={'컨설턴트·관리 멘토·운영조교가 배정되면\n여기서 바로 대화할 수 있어요.'}
          />
        </Section>
      </Stack>
    );
  }

  const totalUnread = chats.reduce((sum, c) => sum + c.unread, 0);
  // 옛 서버 응답(isCurrentAssignee 없음)은 모두 현재 담당으로 본다
  const current = chats.filter((c) => c.isCurrentAssignee !== false);
  const past = chats.filter((c) => c.isCurrentAssignee === false);

  return (
    <Stack>
      {top}
      {current.length > 0 && (
        <Section
          flush
          title="담당 선생님"
          description={
            totalUnread > 0 ? `읽지 않은 메시지가 ${totalUnread}개 있어요` : '궁금한 건 언제든 편하게 물어보세요'
          }>
          {current.map((c) => (
            <ChatRow key={c.id} chat={c} selected={c.id === selectedId} onPress={() => onOpen(c.id)} />
          ))}
        </Section>
      )}
      {past.length > 0 && (
        <Section
          flush
          title="이전 담당자"
          description={current.length === 0 ? '지금은 배정된 담당자가 없어요' : undefined}>
          {past.map((c) => (
            <ChatRow key={c.id} chat={c} selected={c.id === selectedId} onPress={() => onOpen(c.id)} />
          ))}
        </Section>
      )}
    </Stack>
  );
}

function ChatRow({ chat: c, selected, onPress }: { chat: StudentChatItem; selected: boolean; onPress: () => void }) {
  const past = c.isCurrentAssignee === false;
  const unread = c.unread > 0;
  const last = c.lastMessage;
  const base = last ? last.content || (last.hasAttachments ? '첨부파일을 보냈어요' : '') : '';
  const preview = c.blockedByMe
    ? '차단한 상대예요'
    : last
      ? last.senderType === 'STUDENT'
        ? `나: ${base}`
        : base
      : '대화를 시작해 보세요';
  const time = formatAgo(c.lastMessageAt);

  return (
    <ListRow
      onPress={onPress}
      chevron={false}
      muted={past}
      style={selected ? { backgroundColor: color.bg.transparentSelected } : undefined}
      leading={
        <View style={past ? { opacity: 0.5 } : undefined}>
          <Avatar name={c.partner.name} size={48} />
        </View>
      }
      title={
        <View style={s.titleRow}>
          <Text variant="t5-medium" color={past ? 'neutralSubtle' : 'neutral'} numberOfLines={1} style={{ flexShrink: 1 }}>
            {c.partner.name}
          </Text>
          <Badge>{c.partner.roleLabel}</Badge>
          {c.blockedByMe ? <Badge tone="bad">차단</Badge> : null}
        </View>
      }
      description={
        <Text
          variant={unread ? 't4-medium' : 't4-regular'}
          color={unread ? 'neutralMuted' : last ? 'neutralSubtle' : 'placeholder'}
          numberOfLines={1}>
          {preview}
        </Text>
      }
      trailing={
        time || unread ? (
          <View style={s.trailing}>
            {time ? (
              <Text variant="t3-regular" color="placeholder" tabular>
                {time}
              </Text>
            ) : null}
            <CountBadge count={c.unread} />
          </View>
        ) : undefined
      }
    />
  );
}

/** 가족 톡방 고정 행 — 학부모·운영진과 함께 보는 방 (마지막 글 · 안 읽은 수) */
function FamilyRow({
  last,
  unread,
  selected,
  onPress,
}: {
  last: FamilyChatThreadResponse['messages'][number] | null;
  unread: number;
  selected: boolean;
  onPress: () => void;
}) {
  const body = last ? last.content || (last.attachments.length ? '사진·파일을 보냈어요' : '') : '';
  const preview = !last
    ? '학부모님, 운영진과 함께 보는 방이에요'
    : last.senderKind === 'SYSTEM'
      ? body
      : `${last.mine ? '나' : last.senderName}: ${body}`;
  const time = last ? formatAgo(last.createdAt) : '';
  return (
    <Section flush>
      <ListRow
        onPress={onPress}
        chevron={false}
        style={selected ? { backgroundColor: color.bg.transparentSelected } : undefined}
        leading={<IconTile icon={Users} tone="brand" size={48} round />}
        title={
          <Text variant="t5-medium" numberOfLines={1}>
            가족 톡방
          </Text>
        }
        description={
          <Text
            variant={unread > 0 ? 't4-medium' : 't4-regular'}
            color={unread > 0 ? 'neutralMuted' : last ? 'neutralSubtle' : 'placeholder'}
            numberOfLines={1}>
            {preview}
          </Text>
        }
        trailing={
          time || unread > 0 ? (
            <View style={s.trailing}>
              {time ? (
                <Text variant="t3-regular" color="placeholder" tabular>
                  {time}
                </Text>
              ) : null}
              <CountBadge count={unread} />
            </View>
          ) : undefined
        }
      />
    </Section>
  );
}

function ChatListSkeleton() {
  return (
    <Section flush title="담당 선생님">
      {[0, 1].map((i) => (
        <View key={i} style={s.skeletonRow}>
          <Skeleton style={{ width: 48, height: 48, borderRadius: 24 }} />
          <View style={{ flex: 1, gap: space.x1_5 }}>
            <Skeleton style={{ width: '45%', height: 20 }} />
            <Skeleton style={{ width: '75%', height: 16 }} />
          </View>
        </View>
      ))}
    </Section>
  );
}

const s = StyleSheet.create({
  master: { padding: space.x4, paddingBottom: space.x8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5, minWidth: 0 },
  trailing: { alignItems: 'flex-end', gap: space.x1_5 },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    paddingHorizontal: space.x5,
    paddingVertical: space.x3,
  },
});
