import { useLocalSearchParams } from 'expo-router';
import { MoreVertical } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';

import { ChatThread, type ChatThreadActions } from '@/components/chat-thread';
import { HeaderIconButton, Screen } from '@/design';
import { refreshBadges } from '@/lib/badges';

const BASE = '/api/mobile/v1/staff/chats';

/** 학생 1:1 채팅 — 소통 탭 > 채팅에서 진입 (태블릿은 소통 탭 오른쪽 패널). 헤더 ⋯ 로 신고·차단 */
export default function StaffChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const [title, setTitle] = useState('채팅');
  const actions = useRef<ChatThreadActions | null>(null);

  // 열면 서버가 읽음 처리 — 나갈 때도 탭 배지 갱신
  useEffect(() => () => refreshBadges(), []);

  return (
    <Screen
      kind="push"
      title={title}
      scroll={false}
      backFallback="/(staff)/(tabs)/inbox"
      right={
        <HeaderIconButton icon={MoreVertical} label="신고·차단" onPress={() => actions.current?.openMenu()} />
      }>
      <ChatThread
        basePath={BASE}
        chatId={String(chatId)}
        showPartnerBar={false}
        avoidKeyboard={false}
        actionsRef={actions}
        onLoaded={({ partner }) => setTitle(partner.name)}
      />
    </Screen>
  );
}
