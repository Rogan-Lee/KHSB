import { MessagesSquare, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { Avatar, EmptyState, ErrorState, Section, TextField, color } from '@/design';
import { staffInboxPaths } from '@/lib/api/staff-inbox';
import { useMobileQuery, type ChatListResponse, type ChatSummary } from '@/lib/mobile-api';

import { formatInboxTime } from './time';
import { InboxListSkeleton, InboxRow, PaneScroll } from './ui';

/** 검색창을 보여 줄 최소 대화방 수 */
const SEARCH_MIN = 7;

function chatPreview(c: ChatSummary) {
  if (!c.lastMessage) return '아직 대화가 없어요';
  const body = c.lastMessage.content || (c.lastMessage.hasAttachments ? '사진·파일을 보냈어요' : '');
  return c.lastMessage.senderType === 'STAFF' ? `나: ${body}` : body;
}

/** 담당 학생과의 1:1 채팅 목록 */
export function ChatsPanel({
  selectedId,
  onOpen,
  refreshKey,
}: {
  selectedId: string | null;
  onOpen: (id: string) => void;
  refreshKey: number;
}) {
  const { data, error, isLoading, isRefreshing, refresh, retry } = useMobileQuery<ChatListResponse>(
    staffInboxPaths.chats,
  );
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (refreshKey > 0) void refresh();
  }, [refreshKey, refresh]);

  const chats = data?.chats ?? [];
  const q = query.trim();
  const visible = q ? chats.filter((c) => c.partner.name.includes(q)) : chats;

  return (
    <PaneScroll refreshing={isRefreshing} onRefresh={() => void refresh()}>
      {chats.length >= SEARCH_MIN ? (
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="학생 이름 검색"
          returnKeyType="search"
          accessibilityLabel="학생 이름 검색"
          prefix={<Search color={color.fg.neutralSubtle} size={18} strokeWidth={2} />}
        />
      ) : null}

      {isLoading && !data ? (
        <InboxListSkeleton />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : chats.length === 0 ? (
        <Section>
          <EmptyState
            icon={MessagesSquare}
            title="담당 학생이 없어요"
            description="담당 학생이 배정되면 여기서 1:1로 대화할 수 있어요."
          />
        </Section>
      ) : visible.length === 0 ? (
        <Section>
          <EmptyState icon={Search} title="검색 결과가 없어요" description="이름을 다시 확인해 주세요." />
        </Section>
      ) : (
        <Section flush>
          {visible.map((c) => (
            <InboxRow
              key={c.id}
              leading={<Avatar name={c.partner.name} size={40} />}
              title={c.partner.name}
              subtitle={c.partner.roleLabel}
              time={c.lastMessageAt ? formatInboxTime(c.lastMessageAt) : null}
              preview={chatPreview(c)}
              unread={c.id === selectedId ? 0 : c.unread}
              selected={c.id === selectedId}
              onPress={() => onOpen(c.id)}
              accessibilityLabel={`${c.partner.name} 학생과의 채팅${c.unread > 0 ? `, 새 메시지 ${c.unread}개` : ''}`}
            />
          ))}
        </Section>
      )}
    </PaneScroll>
  );
}
