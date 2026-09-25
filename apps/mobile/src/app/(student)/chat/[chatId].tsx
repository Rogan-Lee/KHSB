import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ChatThread } from '@/components/chat-thread';
import { Screen } from '@/design';
import { STUDENT_CHATS_PATH } from '@/lib/api/student-comm';

/** 1:1 대화 — 웹 학생 포털 chat/[chatId] (제목 = 상대 이름, 날짜 구분선·말풍선·작성창) */
export default function StudentChatDetailScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const [title, setTitle] = useState('대화');
  return (
    <Screen kind="push" title={title} scroll={false} maxWidth={0} backFallback="/(student)/(tabs)/chat">
      {chatId ? (
        <ChatThread
          basePath={STUDENT_CHATS_PATH}
          chatId={chatId}
          showPartnerBar={false}
          avoidKeyboard={false}
          onLoaded={({ partner }) => setTitle(partner.name)}
        />
      ) : null}
    </Screen>
  );
}
