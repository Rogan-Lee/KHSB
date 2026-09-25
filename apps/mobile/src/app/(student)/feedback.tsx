import { useRouter } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Avatar,
  Badge,
  Button,
  color,
  Columns,
  EmptyState,
  ErrorState,
  GroupLabel,
  IconTile,
  Press,
  radius,
  Screen,
  Section,
  Skeleton,
  space,
  Stack,
  StatGrid,
  TABLET_CONTENT_WIDTH,
  TABLET_WIDE,
  Text,
  useResponsive,
  type Tone,
} from '@/design';
import { refreshBadges } from '@/lib/badges';
import {
  useMobileQuery,
  type StudentFeedbackItem,
  type StudentFeedbackResponse,
} from '@/lib/mobile-api';

// 웹 학생 포털 받은 피드백(/s/[token]/feedback)과 같은 구성: 요약 → 날짜별 타임라인.
// 태블릿(≥700): 왼쪽 날짜별 타임라인, 오른쪽 요약(+ 종류별 건수).
// 서버 GET 이 조회와 동시에 미확인 피드백을 읽음 처리한다(isNew 는 처리 전 상태).

const FEEDBACK_PATH = '/api/mobile/v1/student/feedback';

const FEEDBACK_STATUS: Record<StudentFeedbackItem['status'], { label: string; tone: Tone }> = {
  COMMENT: { label: '코멘트', tone: 'gray' },
  NEEDS_REVISION: { label: '수정 요청', tone: 'bad' },
  APPROVED: { label: '승인', tone: 'ok' },
};

const KST = 9 * 60 * 60 * 1000;

function sameDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** 오늘 · 어제 · 9월 3일 · 2025년 12월 1일 (KST) */
function dateGroupLabel(iso: string): string {
  const now = new Date(Date.now() + KST);
  const d = new Date(new Date(iso).getTime() + KST);
  if (sameDay(now, d)) return '오늘';
  if (sameDay(new Date(now.getTime() - 86_400_000), d)) return '어제';
  if (now.getUTCFullYear() === d.getUTCFullYear()) return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** 오전 9:05 (KST) */
function timeLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() + KST);
  const h = d.getUTCHours();
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h < 12 ? '오전' : '오후'} ${h12}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export default function StudentFeedbackScreen() {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const { data, error, isRefreshing, refresh, retry } =
    useMobileQuery<StudentFeedbackResponse>(FEEDBACK_PATH);

  // 조회로 읽음 처리됐으니 탭바·홈 배지를 다시 불러온다
  const unread = data?.summary.unread ?? 0;
  useEffect(() => {
    if (unread > 0) refreshBadges();
  }, [unread]);

  const items = data?.items ?? [];
  const groups = new Map<string, StudentFeedbackItem[]>();
  for (const fb of items) {
    const key = dateGroupLabel(fb.createdAt);
    const list = groups.get(key);
    if (list) list.push(fb);
    else groups.set(key, [fb]);
  }

  const summary = data ? (
    <Section key="summary">
      <View style={s.summary}>
        <IconTile icon={MessageCircle} tone={unread > 0 ? 'brand' : 'info'} size={48} round />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="t6-bold">
            {unread > 0 ? `새 피드백 ${unread}건이 도착했어요` : '피드백을 모두 확인했어요'}
          </Text>
          <Text variant="t4-regular" color="neutralSubtle" tabular style={{ marginTop: space.x0_5 }}>
            지금까지 받은 피드백 총 {data.summary.total}건
          </Text>
        </View>
      </View>
      {/* 태블릿 오른쪽 단 — 종류별 건수 */}
      {isTablet && (
        <StatGrid
          style={{ marginTop: space.x4 }}
          items={[
            {
              label: '수정 요청',
              value: `${countOf(items, 'NEEDS_REVISION')}건`,
              tone: countOf(items, 'NEEDS_REVISION') > 0 ? 'critical' : 'neutral',
            },
            { label: '승인', value: `${countOf(items, 'APPROVED')}건`, tone: 'positive' },
            { label: '코멘트', value: `${countOf(items, 'COMMENT')}건` },
          ]}
        />
      )}
    </Section>
  ) : null;

  const timeline = [...groups.entries()].map(([label, list], i) => (
    // 태블릿 왼쪽 단 첫 묶음은 오른쪽 요약 카드와 윗선을 맞춘다
    <View key={label} style={{ paddingTop: isTablet && i === 0 ? 0 : space.x2 }}>
      <GroupLabel trailing={`${list.length}건`}>{label}</GroupLabel>
      <Section flush>
        {list.map((fb) => (
          <FeedbackRow key={fb.id} fb={fb} onPress={() => router.push(`/(student)/tasks/${fb.taskId}`)} />
        ))}
      </Section>
    </View>
  ));

  let body;
  if (!data) {
    body = error ? (
      <Centered isTablet={isTablet}>
        <ErrorState message={error} onRetry={() => void retry()} />
      </Centered>
    ) : (
      <FeedbackSkeleton isTablet={isTablet} />
    );
  } else if (items.length === 0) {
    body = (
      <Centered isTablet={isTablet}>
        <Section>
          <EmptyState
            icon={MessageCircle}
            tone="info"
            title="받은 피드백이 없어요"
            description={'수행평가를 제출하면 컨설턴트가 검토하고\n피드백을 남겨줘요.'}
            action={
              <Button variant="weak" size="md" onPress={() => router.navigate('/(student)/(tabs)/tasks')}>
                수행평가 보러 가기
              </Button>
            }
            style={{ paddingVertical: space.x8 }}
          />
        </Section>
      </Centered>
    );
  } else if (isTablet) {
    body = <Columns left={timeline} right={summary} />;
  } else {
    body = (
      <Stack>
        {summary}
        {timeline}
      </Stack>
    );
  }

  return (
    <Screen
      kind="push"
      title="받은 피드백"
      backFallback="/(student)/(tabs)/menu"
      maxWidth={isTablet ? TABLET_WIDE : undefined}
      refreshing={isRefreshing}
      onRefresh={() => void refresh()}>
      {body}
    </Screen>
  );
}

function countOf(items: StudentFeedbackItem[], status: StudentFeedbackItem['status']) {
  return items.filter((fb) => fb.status === status).length;
}

/** 태블릿 넓은 화면에서 한 단짜리 상태(빈 목록·오류)는 기본 폭으로 가운데 */
function Centered({ isTablet, children }: { isTablet: boolean; children: ReactNode }) {
  if (!isTablet) return <>{children}</>;
  return <View style={s.centered}>{children}</View>;
}

function FeedbackRow({ fb, onPress }: { fb: StudentFeedbackItem; onPress: () => void }) {
  const st = FEEDBACK_STATUS[fb.status];
  return (
    <Press
      onPress={onPress}
      scale={0}
      pressedBg
      style={s.row}
      accessibilityLabel={`${fb.authorName} ${st.label}${fb.isNew ? ', 새 피드백' : ''}. ${fb.taskTitle} 과제로 이동`}>
      <Avatar name={fb.authorName} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.nameRow}>
          <Text variant="t5-bold" numberOfLines={1} style={{ flexShrink: 1 }}>
            {fb.authorName}
          </Text>
          <Badge tone={st.tone}>{st.label}</Badge>
          {fb.isNew && <View style={s.newDot} />}
        </View>
        <Text variant="t5-regular" color="neutralMuted" numberOfLines={3} style={{ marginTop: space.x1 }}>
          {fb.content}
        </Text>
        <View style={s.meta}>
          <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1} style={{ flexShrink: 1 }}>
            {fb.subject} · {fb.taskTitle}
          </Text>
          <Text variant="t3-regular" color="neutralSubtle" tabular>
            · v{fb.version} · {timeLabel(fb.createdAt)}
          </Text>
        </View>
      </View>
    </Press>
  );
}

function FeedbackSkeleton({ isTablet }: { isTablet: boolean }) {
  const summary = (
    <View key="summary" style={[s.card, s.summary]}>
      <Skeleton style={{ width: 48, height: 48, borderRadius: 24 }} />
      <View style={{ flex: 1, gap: space.x2 }}>
        <Skeleton style={{ width: '75%', height: 20 }} />
        <Skeleton style={{ width: '50%', height: 16 }} />
      </View>
    </View>
  );
  const label = (
    <Skeleton key="label" style={{ width: 60, height: 16, marginTop: isTablet ? 0 : space.x2, marginLeft: space.x1 }} />
  );
  const list = (
    <View key="list" style={[s.card, { gap: space.x5 }]}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: space.x3_5 }}>
          <Skeleton style={{ width: 40, height: 40, borderRadius: 20 }} />
          <View style={{ flex: 1, gap: space.x2 }}>
            <Skeleton style={{ width: '40%', height: 18 }} />
            <Skeleton style={{ width: '100%', height: 16 }} />
            <Skeleton style={{ width: '65%', height: 14 }} />
          </View>
        </View>
      ))}
    </View>
  );
  if (isTablet) return <Columns left={[label, list]} right={summary} />;
  return (
    <Stack>
      {summary}
      {label}
      {list}
    </Stack>
  );
}

const s = StyleSheet.create({
  centered: { width: '100%', maxWidth: TABLET_CONTENT_WIDTH, alignSelf: 'center' },
  card: { backgroundColor: color.bg.layerDefault, borderRadius: radius.r5, padding: space.x5 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.x3_5 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.x3_5,
    marginHorizontal: space.x2,
    paddingHorizontal: space.x3,
    paddingVertical: space.x3_5,
    borderRadius: radius.r4,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  newDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: space.x0_5,
    backgroundColor: color.bg.brandSolid,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.x1, marginTop: space.x1_5 },
});
