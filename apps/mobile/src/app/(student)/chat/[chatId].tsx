import { useLocalSearchParams } from 'expo-router';
import { MoreVertical } from 'lucide-react-native';
import { useRef, useState } from 'react';

import { ChatThread, type ChatThreadActions } from '@/components/chat-thread';
import { HeaderIconButton, Screen } from '@/design';
import { STUDENT_CHATS_PATH } from '@/lib/api/student-comm';

/** 1:1 대화 — 웹 학생 포털 chat/[chatId] (제목 = 상대 이름, 날짜 구분선·말풍선·작성창) + 헤더 ⋯ 신고·차단 */
export default function StudentChatDetailScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const [title, setTitle] = useState('대화');
  const actions = useRef<ChatThreadActions | null>(null);
  return (
    <Screen
      kind="push"
      title={title}
      scroll={false}
      maxWidth={0}
      backFallback="/(student)/(tabs)/chat"
      right={
        <HeaderIconButton icon={MoreVertical} label="신고·차단" onPress={() => actions.current?.openMenu()} />
      }>
      {chatId ? (
        <ChatThread
          basePath={STUDENT_CHATS_PATH}
          chatId={chatId}
          showPartnerBar={false}
          avoidKeyboard={false}
          actionsRef={actions}
          onLoaded={({ partner }) => setTitle(partner.name)}
        />
      ) : null}
    </Screen>
  );
}
