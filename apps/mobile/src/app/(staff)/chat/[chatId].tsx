import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { ChatThread } from '@/components/chat-thread';
import { Screen } from '@/design';
import { refreshBadges } from '@/lib/badges';

const BASE = '/api/mobile/v1/staff/chats';

/** 학생 1:1 채팅 — 소통 탭 > 채팅에서 진입 (태블릿은 소통 탭 오른쪽 패널) */
export default function StaffChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const [title, setTitle] = useState('채팅');

  // 열면 서버가 읽음 처리 — 나갈 때도 탭 배지 갱신
  useEffect(() => () => refreshBadges(), []);

  return (
    <Screen kind="push" title={title} scroll={false} backFallback="/(staff)/(tabs)/inbox">
      <ChatThread
        basePath={BASE}
        chatId={String(chatId)}
        showPartnerBar={false}
        avoidKeyboard={false}
        onLoaded={({ partner }) => setTitle(partner.name)}
      />
    </Screen>
  );
}
