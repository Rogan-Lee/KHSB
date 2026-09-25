import type { Href } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ChatThread } from '@/components/chat-thread';
import { TwoPane } from '@/components/two-pane';
import {
  Avatar,
  Badge,
  CountBadge,
  EmptyState,
  ErrorState,
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
import { formatAgo } from '@/features/student-comm/format';
import { useLiveRefresh } from '@/features/student-comm/live-refresh';
import { STUDENT_CHATS_PATH, type StudentChatItem, type StudentChatList } from '@/lib/api/student-comm';
import { useMobileQuery } from '@/lib/mobile-api';

const chatHref = (id: string) => `/(student)/chat/${id}` as Href;

/** 메시지 탭 — 웹 학생 포털 /s/[token]/chat 과 같은 구성 (담당 선생님 / 이전 담당자). 태블릿은 목록 + 오른쪽 대화. */
export default function StudentChatTab() {
  const { data, error, isRefreshing, refresh, retry } = useMobileQuery<StudentChatList>(STUDENT_CHATS_PATH);
  const md = useMasterDetail(chatHref);
  const { width } = useResponsive();

  // 새 메시지·미확인 수 반영 (15초, 앱 복귀 시 즉시)
  useLiveRefresh(retry, 15_000);

  const body = !data ? (
    error ? (
      <ErrorState message={error} onRetry={() => void retry()} />
    ) : (
      <ChatListSkeleton />
    )
  ) : (
    <ChatList chats={data.chats} selectedId={md.selectedId} onOpen={md.open} />
  );

  if (!md.isTablet) {
    return (
      <Screen kind="tab" title="메시지" refreshing={isRefreshing} onRefresh={() => void refresh()}>
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
                onRefresh={() => void refresh()}
                tintColor={color.fg.neutralSubtle}
                colors={[color.fg.brand]}
              />
            }>
            {body}
          </ScrollView>
        }
        detail={
          md.selectedId ? (
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
}: {
  chats: StudentChatItem[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  if (chats.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={MessageCircle}
          title="아직 배정된 담당자가 없어요"
          description={'컨설턴트·관리 멘토·운영조교가 배정되면\n여기서 바로 대화할 수 있어요.'}
        />
      </Section>
    );
  }

  const totalUnread = chats.reduce((sum, c) => sum + c.unread, 0);
  // 옛 서버 응답(isCurrentAssignee 없음)은 모두 현재 담당으로 본다
  const current = chats.filter((c) => c.isCurrentAssignee !== false);
  const past = chats.filter((c) => c.isCurrentAssignee === false);

  return (
    <Stack>
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
  const preview = last ? (last.senderType === 'STUDENT' ? `나: ${base}` : base) : '대화를 시작해 보세요';
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
