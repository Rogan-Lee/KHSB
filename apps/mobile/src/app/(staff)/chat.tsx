import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatThread } from '@/components/chat-thread';
import { Avatar, Badge, EmptyState, ErrorState, LoadingState } from '@/components/mobile-ui';
import { colors, spacing, type } from '@/constants/theme';
import { ChatListResponse, useMobileQuery } from '@/lib/mobile-api';

const BASE = '/api/mobile/v1/staff/chats';

export default function StaffChatScreen() {
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<ChatListResponse>(BASE);
  const [activeId, setActiveId] = useState<string | null>(null);

  const chats = data?.chats ?? [];
  const active = chats.find((c) => c.id === activeId) ?? null;

  if (active) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ChatThread
          basePath={BASE}
          chatId={active.id}
          onBack={() => {
            setActiveId(null);
            void refresh();
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>학생 채팅</Text>
        <Text style={styles.subtitle}>담당 학생과 1:1로 대화하세요.</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}>
        {isLoading && !data ? <LoadingState /> : null}
        {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
        {data && chats.length === 0 ? (
          <EmptyState
            title="담당 학생이 없습니다"
            message="배정된 학생이 생기면 여기에 표시됩니다."
          />
        ) : null}
        {chats.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setActiveId(c.id)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
            <Avatar label={c.partner.name.slice(0, 1)} size={44} />
            <View style={styles.rowText}>
              <View style={styles.rowTop}>
                <Text style={styles.rowName}>{c.partner.name}</Text>
                <Text style={styles.rowMeta}>{c.partner.roleLabel}</Text>
              </View>
              <Text style={styles.rowLast} numberOfLines={1}>
                {c.lastMessage
                  ? `${c.lastMessage.senderType === 'STAFF' ? '나: ' : ''}${c.lastMessage.content || (c.lastMessage.hasAttachments ? '📎 첨부파일' : '')}`
                  : '아직 대화가 없습니다.'}
              </Text>
            </View>
            {c.unread > 0 ? <Badge tone="negative">{c.unread}</Badge> : null}
          </Pressable>
        ))}
        {isRefreshing ? null : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  title: { ...type.heading1, color: colors.textNormal },
  subtitle: { ...type.caption1, color: colors.textAssistive, marginTop: 2 },

  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineAlt,
  },
  rowText: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { ...type.label1, color: colors.textNormal },
  rowMeta: { ...type.caption2, color: colors.textAssistive },
  rowLast: { ...type.caption1, color: colors.textAssistive },
});
