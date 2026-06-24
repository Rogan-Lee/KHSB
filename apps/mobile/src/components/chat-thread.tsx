import { ChevronLeft, Send } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Avatar, ErrorState, LoadingState } from '@/components/mobile-ui';
import { colors, palette, radius, spacing, type } from '@/constants/theme';
import {
  ChatThreadResponse,
  mutateMobileApi,
  useMobileQuery,
} from '@/lib/mobile-api';

/**
 * 학생·직원 공용 채팅 스레드.
 * basePath 예: '/api/mobile/v1/student/chats' | '/api/mobile/v1/staff/chats'
 */
export function ChatThread({
  basePath,
  chatId,
  accentColor = palette.blue50,
  onBack,
}: {
  basePath: string;
  chatId: string;
  accentColor?: string;
  onBack?: () => void;
}) {
  const path = `${basePath}/${chatId}`;
  const { data, error, isLoading, refresh, retry } =
    useMobileQuery<ChatThreadResponse>(path);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft('');
    try {
      await mutateMobileApi(path, 'POST', { content });
      await refresh();
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch {
      setDraft(content); // 실패 시 복구
    } finally {
      setSending(false);
    }
  }

  if (isLoading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={() => void retry()} />;
  if (!data) return null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={8}
      style={styles.flex}>
      <View style={styles.partnerBar}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={10}
            style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}>
            <ChevronLeft color={colors.textNormal} size={26} />
          </Pressable>
        ) : null}
        <Avatar
          label={data.partner.name.slice(0, 2)}
          size={38}
          tone={{ background: palette.blue5, foreground: accentColor }}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.partnerName}>{data.partner.name}</Text>
          <Text style={styles.partnerRole}>{data.partner.roleLabel}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        {data.messages.length === 0 ? (
          <Text style={styles.hint}>첫 메시지를 보내 대화를 시작하세요.</Text>
        ) : (
          data.messages.map((m) => (
            <View
              key={m.id}
              style={[styles.bubble, m.mine ? styles.bubbleMine : styles.bubbleOther]}>
              <Text style={[styles.bubbleText, m.mine && styles.bubbleTextMine]}>
                {m.content}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="메시지 입력"
          placeholderTextColor={colors.textAssistive}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={send}
          returnKeyType="send"
          editable={!sending}
        />
        <Pressable
          onPress={send}
          disabled={sending}
          style={({ pressed }) => [
            styles.sendBtn,
            { backgroundColor: accentColor },
            (pressed || sending) && { opacity: 0.7 },
          ]}>
          <Send color={colors.textOncolor} size={20} strokeWidth={2.2} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  partnerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: spacing.sm,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineNeutral,
    backgroundColor: colors.surface,
  },
  back: { padding: 2 },
  partnerName: { ...type.label1, color: colors.textNormal },
  partnerRole: { ...type.caption2, color: colors.textAssistive, marginTop: 1 },

  body: { backgroundColor: colors.bgAlternative, flexGrow: 1, padding: spacing.lg, gap: 10 },
  hint: { ...type.body3, color: colors.textAssistive, textAlign: 'center', marginTop: spacing.xl },

  bubble: { maxWidth: '80%', paddingHorizontal: 13, paddingVertical: 10 },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineNeutral,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: palette.blue50,
    borderRadius: 16,
    borderBottomRightRadius: 4,
  },
  bubbleText: { ...type.body3, color: colors.textNormal },
  bubbleTextMine: { color: colors.textOncolor },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.lineNeutral,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.full,
    paddingHorizontal: 15,
    paddingVertical: 10,
    ...type.body3,
    color: colors.textNormal,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
