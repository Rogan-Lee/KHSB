import { MessagesSquare, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { Avatar, Badge, Chip, ChipGroup, EmptyState, ErrorState, Section, TextField, color } from '@/design';
import { formatInboxTime } from '@/features/staff-inbox/time';
import { InboxListSkeleton, InboxRow, PaneScroll } from '@/features/staff-inbox/ui';
import { STAFF_FAMILY_CHATS_PATH, type FamilyChatRoomsResponse } from '@/lib/api/family-chat';
import { useMobileQuery } from '@/lib/mobile-api';

/** 직원 소통 탭 > 가족 — 재원생 전체 방 (미확인 → 최근 대화 → 이름 순, 서버 정렬) */
export function FamilyRoomsPanel({
  selectedId,
  onOpen,
  refreshKey,
}: {
  /** 선택된 학생 id (태블릿) */
  selectedId: string | null;
  onOpen: (studentId: string) => void;
  refreshKey: number;
}) {
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<FamilyChatRoomsResponse>(STAFF_FAMILY_CHATS_PATH);
  const [query, setQuery] = useState('');
  const [mineOnly, setMineOnly] = useState(false);

  useEffect(() => {
    if (refreshKey > 0) void refresh();
  }, [refreshKey, refresh]);

  const rooms = data?.rooms ?? [];
  const mineCount = rooms.filter((r) => r.isMine).length;
  const q = query.trim();
  const visible = rooms.filter((r) => (!mineOnly || r.isMine) && (!q || r.name.includes(q)));

  return (
    <PaneScroll refreshing={isRefreshing} onRefresh={() => void refresh()}>
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder="학생 이름 검색"
        returnKeyType="search"
        accessibilityLabel="학생 이름 검색"
        prefix={<Search color={color.fg.neutralSubtle} size={18} strokeWidth={2} />}
      />
      <ChipGroup>
        <Chip selected={!mineOnly} onPress={() => setMineOnly(false)}>
          전체
        </Chip>
        <Chip selected={mineOnly} onPress={() => setMineOnly(true)}>
          {mineCount > 0 ? `내 담당 ${mineCount}` : '내 담당'}
        </Chip>
      </ChipGroup>

      {isLoading && !data ? (
        <InboxListSkeleton />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : visible.length === 0 ? (
        <Section>
          {q ? (
            <EmptyState icon={Search} title="검색 결과가 없어요" description="이름을 다시 확인해 주세요." />
          ) : (
            <EmptyState
              icon={MessagesSquare}
              title={mineOnly ? '담당 학생이 없어요' : '재원생이 없어요'}
              description="학생마다 가족 톡방이 하나씩 있어요."
            />
          )}
        </Section>
      ) : (
        <Section flush>
          {visible.map((r) => {
            const unread = r.unread && r.studentId !== selectedId;
            return (
              <InboxRow
                key={r.studentId}
                leading={<Avatar name={r.name} size={40} />}
                title={r.name}
                subtitle={[r.grade, r.seat ? `${r.seat}번` : null].filter(Boolean).join(' · ')}
                time={r.lastMessageAt ? formatInboxTime(r.lastMessageAt) : null}
                preview={r.lastMessage ? `${r.lastMessage.senderName}: ${r.lastMessage.content}` : '아직 대화가 없어요'}
                dot={unread}
                selected={r.studentId === selectedId}
                onPress={() => onOpen(r.studentId)}
                accessibilityLabel={`${r.name} 가족 톡방${unread ? ', 확인하지 않은 글 있음' : ''}`}
                meta={
                  r.isMine || r.parentCount === 0 ? (
                    <>
                      {r.isMine ? <Badge tone="violet">내 담당</Badge> : null}
                      {r.parentCount === 0 ? <Badge tone="gray">학부모 미연결</Badge> : null}
                    </>
                  ) : undefined
                }
              />
            );
          })}
        </Section>
      )}
    </PaneScroll>
  );
}
