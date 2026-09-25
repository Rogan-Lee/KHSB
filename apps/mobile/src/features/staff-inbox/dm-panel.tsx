import { MessageSquareText, Search, SquarePen } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  Avatar,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  ListRow,
  Section,
  Text,
  TextField,
  color,
  space,
} from '@/design';
import { staffInboxPaths, type StaffDmInboxResponse, type StaffDmPartner } from '@/lib/api/staff-inbox';
import { useMobileQuery } from '@/lib/mobile-api';

import { formatInboxTime } from './time';
import { InboxListSkeleton, InboxRow, PaneScroll } from './ui';

/** 직원 1:1 DM 목록 + 새 메시지(직원 선택) */
export function DmPanel({
  selectedId,
  onOpen,
  refreshKey,
}: {
  /** 선택된 상대 직원 id (태블릿) */
  selectedId: string | null;
  onOpen: (userId: string) => void;
  refreshKey: number;
}) {
  const { data, error, isLoading, isRefreshing, refresh, retry } = useMobileQuery<StaffDmInboxResponse>(
    staffInboxPaths.dm,
  );
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (refreshKey > 0) void refresh();
  }, [refreshKey, refresh]);

  const threads = data?.threads ?? [];

  const pick = (userId: string) => {
    setPicking(false);
    onOpen(userId);
  };

  return (
    <>
      <PaneScroll refreshing={isRefreshing} onRefresh={() => void refresh()}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text variant="t4-regular" color="neutralSubtle" style={{ flex: 1 }}>
            운영진끼리 1:1로 이야기해요
          </Text>
          <Button
            variant="weak"
            size="sm"
            icon={SquarePen}
            onPress={() => setPicking(true)}
            disabled={!data}
            accessibilityLabel="새 메시지 보내기">
            새 메시지
          </Button>
        </View>

        {isLoading && !data ? (
          <InboxListSkeleton />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={() => void retry()} />
        ) : threads.length === 0 ? (
          <Section>
            <EmptyState
              icon={MessageSquareText}
              title="아직 주고받은 메시지가 없어요"
              description="인수인계나 부탁할 일을 동료에게 바로 보내 보세요."
              action={
                <Button variant="primary" size="md" icon={SquarePen} onPress={() => setPicking(true)}>
                  새 메시지
                </Button>
              }
            />
          </Section>
        ) : (
          <Section flush>
            {threads.map((t) => (
              <InboxRow
                key={t.id}
                leading={<Avatar name={t.other.name} size={40} />}
                title={t.other.name}
                subtitle={t.other.roleLabel}
                time={formatInboxTime(t.lastMessage?.createdAt ?? t.lastMessageAt)}
                preview={t.lastMessage ? `${t.lastMessage.mine ? '나: ' : ''}${t.lastMessage.content}` : ''}
                unread={t.other.id === selectedId ? 0 : t.unread}
                selected={t.other.id === selectedId}
                onPress={() => onOpen(t.other.id)}
                accessibilityLabel={`${t.other.name}님과의 메시지${t.unread > 0 ? `, 새 메시지 ${t.unread}개` : ''}`}
              />
            ))}
          </Section>
        )}
      </PaneScroll>

      <NewDmSheet open={picking} onClose={() => setPicking(false)} staff={data?.staff ?? []} onPick={pick} />
    </>
  );
}

/** 새 메시지 — 받는 사람(직원) 고르기 */
function NewDmSheet({
  open,
  onClose,
  staff,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  staff: StaffDmPartner[];
  onPick: (userId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim();
  const visible = q ? staff.filter((s) => s.name.includes(q) || s.roleLabel.includes(q)) : staff;

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={close} title="새 메시지" description="메시지를 보낼 동료를 골라 주세요.">
      {staff.length > 6 ? (
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="이름 또는 역할 검색"
          accessibilityLabel="직원 검색"
          prefix={<Search color={color.fg.neutralSubtle} size={18} strokeWidth={2} />}
        />
      ) : null}
      {visible.length === 0 ? (
        <Text variant="t4-regular" color="neutralSubtle" align="center" style={{ paddingVertical: space.x6 }}>
          {staff.length === 0 ? '메시지를 보낼 수 있는 직원이 없어요' : '검색 결과가 없어요'}
        </Text>
      ) : (
        <View style={{ marginHorizontal: -space.x5 }}>
          {visible.map((s) => (
            <ListRow
              key={s.id}
              leading={<Avatar name={s.name} size={36} />}
              title={s.name}
              description={s.roleLabel}
              onPress={() => {
                setQuery('');
                onPick(s.id);
              }}
            />
          ))}
        </View>
      )}
    </BottomSheet>
  );
}
