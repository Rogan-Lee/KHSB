import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatThread } from '@/components/chat-thread';
import { Avatar, Badge, EmptyState, ErrorState, LoadingState } from '@/components/mobile-ui';
import { colors, palette, spacing, type } from '@/constants/theme';
import { ChatListResponse, useMobileQuery } from '@/lib/mobile-api';

const BASE = '/api/mobile/v1/student/chats';

export default function StudentChatScreen() {
  const { data, error, isLoading, refresh, retry } = useMobileQuery<ChatListResponse>(BASE);
  const [activeId, setActiveId] = useState<string | null>(null);

  const chats = data?.chats ?? [];
  const active = chats.find((c) => c.id === activeId) ?? null;

  // 채팅방(전체화면)
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

  // 채팅 목록
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>소통</Text>
        <Text style={styles.subtitle}>담당 선생님과 1:1로 대화하세요.</Text>
      </View>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {isLoading && !data ? <LoadingState /> : null}
        {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
        {data && chats.length === 0 ? (
          <EmptyState
            title="아직 담당 선생님이 없어요"
            message="멘토·컨설턴트가 지정되면 여기서 대화할 수 있습니다."
          />
        ) : null}
        {chats.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setActiveId(c.id)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
            <Avatar
              label={c.partner.name.slice(0, 2)}
              size={48}
              tone={{ background: palette.blue5, foreground: palette.blue50 }}
            />
            <View style={styles.rowText}>
              <View style={styles.rowTop}>
                <Text style={styles.rowName}>{c.partner.name}</Text>
                <Text style={styles.rowMeta}>{c.partner.roleLabel}</Text>
              </View>
              <Text style={styles.rowLast} numberOfLines={1}>
                {c.lastMessage
                  ? `${c.lastMessage.senderType === 'STUDENT' ? '나: ' : ''}${c.lastMessage.content}`
                  : '먼저 인사를 남겨보세요.'}
              </Text>
            </View>
            {c.unread > 0 ? <Badge tone="negative">{c.unread}</Badge> : null}
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  title: { ...type.heading1, color: colors.textNormal },
  subtitle: { ...type.caption1, color: colors.textAssistive, marginTop: 2 },

  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
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
