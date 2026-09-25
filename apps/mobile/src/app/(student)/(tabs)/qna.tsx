import { useFocusEffect, type Href } from 'expo-router';
import { Camera, Plus } from 'lucide-react-native';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { TwoPane } from '@/components/two-pane';
import {
  Badge,
  Button,
  CountBadge,
  EmptyState,
  ErrorState,
  IconTile,
  ListRow,
  Screen,
  Section,
  Skeleton,
  Stack,
  Text,
  color,
  radius,
  space,
  useMasterDetail,
  useResponsive,
} from '@/design';
import { formatListWhen } from '@/features/student-comm/format';
import { useLiveRefresh } from '@/features/student-comm/live-refresh';
import { QuestionThreadView } from '@/features/student-comm/question-thread-view';
import { takeCreatedQuestion } from '@/features/student-comm/selection';
import {
  QUESTION_STATUS,
  STUDENT_QUESTIONS_PATH,
  type StudentQuestionItem,
  type StudentQuestionList,
} from '@/lib/api/student-comm';
import { useMobileQuery } from '@/lib/mobile-api';

const NEW_HREF = '/(student)/qna/new' as Href;
const questionHref = (id: string) => `/(student)/qna/${id}` as Href;

/** 질문 탭 — 웹 학생 포털 /s/[token]/qna 와 같은 구성 (질문하기 카드 + 내 질문 목록). 태블릿은 목록 + 오른쪽 상세. */
export default function StudentQnaTab() {
  const { data, error, isRefreshing, refresh, retry } =
    useMobileQuery<StudentQuestionList>(STUDENT_QUESTIONS_PATH);
  const md = useMasterDetail(questionHref);
  const { isTablet, open } = md;
  const { width } = useResponsive();

  // 태블릿: 새 질문 등록 후 돌아오면 방금 만든 질문을 오른쪽에 연다
  useFocusEffect(
    useCallback(() => {
      const created = takeCreatedQuestion();
      if (created && isTablet) open(created);
    }, [isTablet, open])
  );

  // 답변이 오면 목록 배지도 바뀌도록 (30초, 앱 복귀 시 즉시)
  useLiveRefresh(retry, 30_000);

  const body = !data ? (
    error ? (
      <ErrorState message={error} onRetry={() => void retry()} />
    ) : (
      <QnaSkeleton />
    )
  ) : (
    <QnaList questions={data.questions} selectedId={md.selectedId} onOpen={md.open} />
  );

  if (!isTablet) {
    return (
      <Screen kind="tab" title="질문" refreshing={isRefreshing} onRefresh={() => void refresh()}>
        {body}
      </Screen>
    );
  }

  return (
    <Screen kind="tab" title="질문" scroll={false} maxWidth={0}>
      <TwoPane
        // iPad mini 세로(744)에서도 대화 패널이 좁지 않도록 목록은 폭의 40% · 320~400
        masterWidth={Math.round(Math.min(400, Math.max(320, width * 0.4)))}
        master={
          <ScrollView
            contentContainerStyle={s.master}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => void refresh()}
                tintColor={color.fg.neutralSubtle}
                colors={[color.fg.brand]}
              />
            }>
            {body}
          </ScrollView>
        }
        detail={
          md.selectedId ? (
            <QuestionThreadView key={md.selectedId} questionId={md.selectedId} onChanged={() => void retry()} />
          ) : null
        }
        detailVisible={!!md.selectedId}
        onCloseDetail={md.close}
        emptyTitle="질문을 선택하세요"
        emptyMessage="왼쪽 목록에서 질문을 고르면 멘토와 주고받은 대화를 여기서 볼 수 있어요."
      />
    </Screen>
  );
}

function QnaList({
  questions,
  selectedId,
  onOpen,
}: {
  questions: StudentQuestionItem[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  if (questions.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={Camera}
          tone="brand"
          title="모르는 문제, 사진 찍어 물어보세요"
          description={'문제 사진을 올리면\n당일 근무 멘토가 풀이를 답해드려요.'}
          action={
            <Button variant="primary" size="lg" href={NEW_HREF}>
              첫 질문 올리기
            </Button>
          }
        />
      </Section>
    );
  }

  const unreadTotal = questions.reduce((sum, q) => sum + unreadOf(q), 0);

  return (
    <Stack>
      <Section>
        <View style={s.askRow}>
          <IconTile icon={Camera} tone="brand" solid size={48} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="t6-bold">모르는 문제, 사진 찍어 물어보세요</Text>
            <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x0_5 }}>
              당일 근무 멘토가 풀이를 답해드려요
            </Text>
          </View>
        </View>
        <Button variant="primary" size="lg" block icon={Plus} href={NEW_HREF} style={{ marginTop: space.x4 }}>
          질문하기
        </Button>
      </Section>

      <Section
        flush
        title="내 질문"
        description={unreadTotal > 0 ? `새 답변 ${unreadTotal}개가 도착했어요` : undefined}
        action={
          <Text variant="t4-medium" color="neutralSubtle" tabular>
            {questions.length}개
          </Text>
        }>
        {questions.map((q) => (
          <QuestionRow key={q.id} q={q} selected={q.id === selectedId} onPress={() => onOpen(q.id)} />
        ))}
      </Section>
    </Stack>
  );
}

function unreadOf(q: StudentQuestionItem) {
  return q.unread ?? (q.hasUnreadAnswer ? 1 : 0);
}

function QuestionRow({ q, selected, onPress }: { q: StudentQuestionItem; selected: boolean; onPress: () => void }) {
  const status = QUESTION_STATUS[q.status];
  const unread = unreadOf(q);
  const hasNew = unread > 0;
  const previewText = q.lastMessage || (q.hasAttachments ? '사진' : '');
  const preview = previewText ? `${q.lastSenderType === 'STAFF' ? '멘토: ' : ''}${previewText}` : null;
  return (
    <ListRow
      onPress={onPress}
      chevron={false}
      align="start"
      style={selected ? { backgroundColor: color.bg.transparentSelected } : undefined}
      meta={
        <>
          {q.subject ? <Badge>{q.subject}</Badge> : null}
          <Badge tone={status.tone}>{status.label}</Badge>
        </>
      }
      title={
        <Text variant="t5-medium" numberOfLines={2}>
          {q.title}
        </Text>
      }
      description={
        preview ? (
          <Text
            variant={hasNew ? 't4-medium' : 't4-regular'}
            color={hasNew ? 'neutralMuted' : 'neutralSubtle'}
            numberOfLines={1}>
            {preview}
          </Text>
        ) : undefined
      }
      trailing={
        <View style={s.trailing}>
          <Text variant="t3-regular" color="placeholder" tabular>
            {formatListWhen(q.lastMessageAt)}
          </Text>
          <CountBadge count={unread} />
        </View>
      }
    />
  );
}

function QnaSkeleton() {
  return (
    <Stack>
      <Section>
        <View style={s.askRow}>
          <Skeleton style={{ width: 48, height: 48, borderRadius: radius.r4 }} />
          <View style={{ flex: 1, gap: space.x1_5 }}>
            <Skeleton style={{ width: '80%', height: 20 }} />
            <Skeleton style={{ width: '55%', height: 16 }} />
          </View>
        </View>
        <Skeleton style={{ height: 52, marginTop: space.x4, borderRadius: radius.r3 }} />
      </Section>
      <Section flush title="내 질문">
        {[0, 1, 2].map((i) => (
          <View key={i} style={s.skeletonRow}>
            <View style={{ flexDirection: 'row', gap: space.x1 }}>
              <Skeleton style={{ width: 36, height: 20, borderRadius: radius.r1 }} />
              <Skeleton style={{ width: 52, height: 20, borderRadius: radius.r1 }} />
            </View>
            <Skeleton style={{ width: '75%', height: 20 }} />
            <Skeleton style={{ width: '50%', height: 16 }} />
          </View>
        ))}
      </Section>
    </Stack>
  );
}

const s = StyleSheet.create({
  master: { padding: space.x4, paddingBottom: space.x8 },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: space.x3_5 },
  trailing: { alignItems: 'flex-end', gap: space.x1_5, paddingTop: space.x0_5 },
  skeletonRow: { gap: space.x1_5, paddingHorizontal: space.x5, paddingVertical: space.x3 },
});
