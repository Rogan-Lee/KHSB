import type { Href } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChatThread } from '@/components/chat-thread';
import { TwoPane } from '@/components/two-pane';
import { CONTENT_MAX_WIDTH, Screen, SegmentTabs, color, space, useMasterDetail } from '@/design';
import { ChatsPanel } from '@/features/staff-inbox/chats-panel';
import { DmPanel } from '@/features/staff-inbox/dm-panel';
import { DmThread } from '@/features/staff-inbox/dm-thread';
import { QuestionDetail } from '@/features/staff-inbox/question-detail';
import { QuestionsPanel } from '@/features/staff-inbox/questions-panel';
import { useStaffBadges } from '@/lib/badges';
import { isStaffCapabilities } from '@/lib/capabilities';
import { useResponsive } from '@/lib/responsive';
import { useSession } from '@/lib/session';

type Segment = 'questions' | 'chats' | 'dm';

const SEGMENTS: Segment[] = ['questions', 'chats', 'dm'];
const CHAT_BASE = '/api/mobile/v1/staff/chats';

const questionHref = (id: string) => `/(staff)/qna/${id}` as Href;
const chatHref = (id: string) => `/(staff)/chat/${id}` as Href;
const dmHref = (id: string) => `/(staff)/dm/${id}` as Href;

/**
 * 직원 소통 탭 — 질문 · 채팅 · 직원 DM.
 * 폰: 목록 → 상세 화면 push. 태블릿: 왼쪽 목록 + 오른쪽 상세(TwoPane).
 * 다른 화면에서 특정 탭으로 열기: router.push('/(staff)/(tabs)/inbox?tab=chats')
 */
export default function StaffInboxScreen() {
  const { session } = useSession();
  const caps = isStaffCapabilities(session?.capabilities) ? session.capabilities : null;
  // 학생 질문 받은함은 오프라인 운영진(requireMobileStaff)만
  const canQuestions = caps?.offlineOps ?? true;
  const badges = useStaffBadges();
  const { isTablet } = useResponsive();
  const params = useLocalSearchParams<{ tab?: string }>();

  const available = useMemo(
    () => SEGMENTS.filter((seg) => seg !== 'questions' || canQuestions),
    [canQuestions],
  );

  // ?tab=questions|chats|dm 으로 들어오면 해당 탭 (파라미터가 바뀔 때마다)
  const paramTab = SEGMENTS.find((seg) => seg === params.tab) ?? null;
  const [chosen, setChosen] = useState<Segment | null>(paramTab);
  const [seenParam, setSeenParam] = useState(paramTab);
  if (paramTab !== seenParam) {
    setSeenParam(paramTab);
    if (paramTab) setChosen(paramTab);
  }
  // 권한 없는 탭(질문)은 건너뛴다 — 역할 정보가 늦게 와도 안전
  const segment: Segment = chosen && available.includes(chosen) ? chosen : available[0];

  // 한 번 연 탭은 계속 붙여 둔다 (스크롤·필터 유지)
  const [visited, setVisited] = useState<Set<Segment>>(() => new Set());
  const select = (next: Segment) => {
    setVisited((prev) => new Set(prev).add(segment).add(next));
    setChosen(next);
  };
  const isVisited = (seg: Segment) => seg === segment || visited.has(seg);

  const [refreshKeys, setRefreshKeys] = useState<Record<Segment, number>>({ questions: 0, chats: 0, dm: 0 });

  const bump = useCallback(
    (seg: Segment) => setRefreshKeys((k) => ({ ...k, [seg]: k[seg] + 1 })),
    [],
  );

  const questionMd = useMasterDetail(questionHref);
  const chatMd = useMasterDetail(chatHref);
  const dmMd = useMasterDetail(dmHref);

  // 태블릿: 상세를 열었다 닫거나 다른 항목으로 옮기면 방금 본 항목이 읽음 처리됐으니 목록 갱신
  useSelectionRefresh(questionMd.selectedId, () => bump('questions'));
  useSelectionRefresh(chatMd.selectedId, () => bump('chats'));

  const tabs = [
    ...(canQuestions ? [{ value: 'questions' as const, label: '질문', count: badges.questions }] : []),
    { value: 'chats' as const, label: '채팅', count: badges.chats },
    { value: 'dm' as const, label: '직원 DM', count: badges.dm },
  ];

  const pane = (seg: Segment, node: React.ReactNode) =>
    isVisited(seg) ? (
      <View key={seg} style={[s.fill, segment !== seg && s.hidden]}>
        {node}
      </View>
    ) : null;

  const master = (
    <View style={s.fill}>
      <View style={[s.tabs, !isTablet && s.tabsPhone]}>
        <SegmentTabs tabs={tabs} value={segment} onChange={select} />
      </View>
      {canQuestions &&
        pane(
          'questions',
          <QuestionsPanel
            selectedId={questionMd.selectedId}
            onOpen={questionMd.open}
            refreshKey={refreshKeys.questions}
          />,
        )}
      {pane('chats', <ChatsPanel selectedId={chatMd.selectedId} onOpen={chatMd.open} refreshKey={refreshKeys.chats} />)}
      {pane('dm', <DmPanel selectedId={dmMd.selectedId} onOpen={dmMd.open} refreshKey={refreshKeys.dm} />)}
    </View>
  );

  if (!isTablet) {
    return (
      <Screen kind="tab" title="소통" scroll={false}>
        {master}
      </Screen>
    );
  }

  const active = segment === 'questions' ? questionMd : segment === 'chats' ? chatMd : dmMd;
  const detail =
    segment === 'questions' && questionMd.selectedId ? (
      <QuestionDetail
        key={questionMd.selectedId}
        questionId={questionMd.selectedId}
        inline
        onClose={questionMd.close}
        onChanged={() => bump('questions')}
      />
    ) : segment === 'chats' && chatMd.selectedId ? (
      <View key={chatMd.selectedId} style={s.chatPanel}>
        {/* 키보드 회피는 바깥 Screen 이 한다 */}
        <ChatThread
          basePath={CHAT_BASE}
          chatId={chatMd.selectedId}
          avoidKeyboard={false}
          onActivity={() => bump('chats')}
        />
      </View>
    ) : segment === 'dm' && dmMd.selectedId ? (
      <DmThread
        key={dmMd.selectedId}
        userId={dmMd.selectedId}
        inline
        onClose={dmMd.close}
        onChanged={() => bump('dm')}
      />
    ) : null;

  return (
    <Screen kind="tab" title="소통" scroll={false} maxWidth={0}>
      <TwoPane
        master={master}
        detail={detail}
        detailVisible={detail != null}
        onCloseDetail={active.close}
        masterWidth={400}
        emptyTitle={
          segment === 'questions' ? '질문을 선택하세요' : segment === 'chats' ? '대화를 선택하세요' : '메시지를 선택하세요'
        }
        emptyMessage="왼쪽 목록에서 고르면 여기에 열려요."
      />
    </Screen>
  );
}

/** 선택이 바뀔 때마다(첫 렌더 제외) onChange 호출 */
function useSelectionRefresh(selectedId: string | null, onChange: () => void) {
  const first = useRef(true);
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    cb.current();
  }, [selectedId]);
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  hidden: { display: 'none' },
  tabs: { paddingHorizontal: space.x4 },
  tabsPhone: { width: '100%', maxWidth: CONTENT_MAX_WIDTH + space.x8, alignSelf: 'center' },
  chatPanel: { flex: 1, backgroundColor: color.bg.layerDefault },
});
