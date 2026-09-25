import type { Href } from 'expo-router';
import {
  CalendarDays,
  Camera,
  ChevronRight,
  CircleUserRound,
  FileText,
  GraduationCap,
  LayoutGrid,
  Megaphone,
  MessageCircle,
  Moon,
  Podcast,
  ShieldCheck,
  SpellCheck,
  Utensils,
  Video,
  Wifi,
} from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  color,
  Columns,
  ErrorState,
  HeaderIconButton,
  IconTile,
  ListRow,
  Press,
  ProgressBar,
  radius,
  Screen,
  Section,
  SectionAction,
  ShortcutGrid,
  Skeleton,
  space,
  Stack,
  TABLET_WIDE,
  Text,
  useResponsive,
  type Shortcut,
} from '@/design';
import {
  dueInfo,
  formatSessionTime,
  greeting,
  STUDENT_HOME_PATH,
  TASK_STATUS,
  type StudentHomeResponse,
} from '@/lib/api/student-home';
import { refreshBadges } from '@/lib/badges';
import { useMobileQuery } from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

// 웹 학생 포털 홈(/s/[token]/page.tsx)과 같은 정보구조·문구·카드 순서.
// 폰: 웹과 똑같은 한 줄 카드 순서. 태블릿(≥700): 두 단 대시보드 —
//   왼쪽 = 인사·수행평가·질문·초기 설문, 오른쪽 = 멘토링·시즌 신청·포인트·바로가기.
// 포털 웹뷰로 보내는 링크는 없다 — 모든 기능이 앱 화면으로 열린다.

const openUrl = (url: string) => void Linking.openURL(url).catch(() => undefined);

// 다른 에이전트가 만드는 학생 화면 — typed routes 생성 전에도 컴파일되도록 Href 로 고정
const QNA_NEW_ROUTE = '/(student)/qna/new' as Href;
const POINTS_ROUTE = '/(student)/points' as Href;
const NAP_ROUTE = '/(student)/nap' as Href;
const NETWORK_ROUTE = '/(student)/network' as Href;
const SCHEDULE_ROUTE = '/(student)/schedule' as Href;
const EXAMS_ROUTE = '/(student)/exams' as Href;
const LUNCH_ROUTE = '/(student)/lunch' as Href;
const CONTENTS_ROUTE = '/(student)/contents' as Href;

export default function StudentHomeScreen() {
  const { session } = useSession();
  const { isTablet } = useResponsive();
  const { data, error, isRefreshing, refresh, retry } =
    useMobileQuery<StudentHomeResponse>(STUDENT_HOME_PATH);

  return (
    <Screen
      kind="home"
      maxWidth={isTablet ? TABLET_WIDE : undefined}
      right={
        // 웹 포털 홈처럼 알림함 없이 계정만 (알림 설정은 전체 탭)
        <HeaderIconButton icon={CircleUserRound} label="내 계정" href="/account" />
      }
      refreshing={isRefreshing}
      onRefresh={() => {
        refreshBadges();
        void refresh();
      }}>
      {data ? (
        <HomeContent
          data={data}
          name={data.student.name || session?.displayName || '학생'}
          isTablet={isTablet}
        />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : (
        <HomeSkeleton isTablet={isTablet} />
      )}
    </Screen>
  );
}

function HomeContent({
  data,
  name,
  isTablet,
}: {
  data: StudentHomeResponse;
  name: string;
  isTablet: boolean;
}) {
  const { badges, mentoring, tasks, survey, points, seasonal } = data;
  const isOnline = data.student.isOnlineManaged;
  const nextSession = mentoring.sessions[0];

  const headline = mentoring.isToday
    ? '오늘 멘토링이 있어요'
    : tasks.open > 0
      ? `진행 중인 수행평가가 ${tasks.open}건 있어요`
      : badges.qna > 0
        ? `질문에 새 답변이 ${badges.qna}건 왔어요`
        : '오늘도 한 걸음씩 가 봐요';

  const shortcuts: Shortcut[] = [
    { key: 'nap', href: NAP_ROUTE, label: '쪽잠 신청', icon: Moon, tone: 'violet' },
    { key: 'network', href: NETWORK_ROUTE, label: '네트워크', icon: Wifi, tone: 'info' },
    { key: 'schedule', href: SCHEDULE_ROUTE, label: '내 일정', icon: CalendarDays, tone: 'ok' },
    {
      key: 'suggestions',
      href: '/(student)/suggestions',
      label: '건의하기',
      icon: Megaphone,
      tone: 'warn',
      dot: badges.suggestions > 0,
    },
  ];
  if (badges.hasVocab)
    shortcuts.push({
      key: 'vocab',
      href: '/(student)/vocab',
      label: '영단어',
      icon: SpellCheck,
      tone: 'info',
      dot: badges.vocab > 0,
    });
  if (isOnline || badges.feedback > 0)
    shortcuts.push({
      key: 'feedback',
      href: '/(student)/feedback',
      label: '피드백',
      icon: MessageCircle,
      tone: 'brand',
      dot: badges.feedback > 0,
    });
  if (data.contentCount > 0)
    shortcuts.push({ key: 'contents', href: CONTENTS_ROUTE, label: '콘텐츠', icon: Podcast, tone: 'violet' });
  shortcuts.push({ key: 'menu', href: '/(student)/(tabs)/menu', label: '전체', icon: LayoutGrid, tone: 'gray' });

  // ─── 카드 ───────────────────────────────────────────────────────────

  /* 인사 */
  const greetingBlock = (
    <View key="greeting" style={s.greeting}>
      <Text variant="t5-medium" color="neutralSubtle">
        {name}님, {greeting()}
      </Text>
      <Text variant="t9-bold" style={{ marginTop: space.x1 }} accessibilityRole="header">
        {headline}
      </Text>
    </View>
  );

  /* 멘토링 */
  const mentoringCard = nextSession ? (
    <Section
      key="mentoring"
      title={mentoring.isToday ? '오늘의 멘토링' : '다음 멘토링'}
      action={mentoring.isToday ? <Badge tone="brand">오늘</Badge> : undefined}>
      <View style={s.rowCenter}>
        <IconTile
          icon={Video}
          tone={mentoring.isToday ? 'brand' : 'info'}
          solid={mentoring.isToday}
          size={48}
        />
        <View style={s.flex}>
          <Text variant="t6-bold" tabular>
            {formatSessionTime(nextSession.scheduledAt)}
          </Text>
          <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x0_5 }}>
            {nextSession.durationMinutes}분 · {nextSession.hostName} 멘토
          </Text>
        </View>
      </View>
      {nextSession.meetUrl ? (
        <Button
          variant={mentoring.isToday ? 'primary' : 'weak'}
          size="lg"
          block
          icon={Video}
          onPress={() => openUrl(nextSession.meetUrl!)}
          style={{ marginTop: space.x4 }}>
          Meet 입장하기
        </Button>
      ) : (
        <View style={s.softNote}>
          <Text variant="t4-regular" color="neutralSubtle">
            Meet 링크는 곧 발급돼요.
          </Text>
        </View>
      )}
      {mentoring.sessions.length > 1 && (
        <View style={s.moreSessions}>
          {mentoring.sessions.slice(1).map((m) => (
            <View key={m.id} style={s.moreSession}>
              <View style={s.flex}>
                <Text variant="t5-medium" color="neutralMuted" tabular>
                  {formatSessionTime(m.scheduledAt)}
                </Text>
                <Text variant="t3-regular" color="neutralSubtle">
                  {m.hostName} · {m.durationMinutes}분
                </Text>
              </View>
              {m.meetUrl && (
                <Button variant="gray" size="xs" onPress={() => openUrl(m.meetUrl!)}>
                  Meet
                </Button>
              )}
            </View>
          ))}
        </View>
      )}
    </Section>
  ) : null;

  /* 질문하기 */
  // 카드 전체가 질문 목록으로, 안쪽 버튼은 새 답변 보기/사진 질문 — 스크린리더는 버튼을 따로 읽도록 accessible=false
  const qnaCard = (
    <Press key="qna" href="/(student)/(tabs)/qna" style={s.card} accessible={false}>
      <View style={[s.rowCenter, { gap: space.x4 }]}>
        <View style={s.flex}>
          <Text variant="t6-bold">모르는 문제가 있나요?</Text>
          <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x1 }}>
            {data.questions.open > 0
              ? `질문 ${data.questions.open}건이 진행 중이에요`
              : '사진만 찍어 올리면 근무 멘토가 풀이해 드려요'}
          </Text>
        </View>
        <IconTile icon={Camera} tone="brand" solid size={48} round />
      </View>
      <Button
        variant="weak"
        size="md"
        block
        href={badges.qna > 0 ? '/(student)/(tabs)/qna' : QNA_NEW_ROUTE}
        style={{ marginTop: space.x4 }}>
        {badges.qna > 0 ? `새 답변 ${badges.qna}건 보기` : '사진으로 질문하기'}
      </Button>
    </Press>
  );

  /* 지금 신청할 수 있어요 (시즌성) */
  const seasonalCard =
    seasonal.lunchOpen || seasonal.examOpenCount > 0 ? (
      <Section key="seasonal" title="지금 신청할 수 있어요" flush>
        {seasonal.lunchOpen && (
          <ListRow
            href={LUNCH_ROUTE}
            leading={<IconTile icon={Utensils} tone="warn" />}
            title="점심 도시락 신청"
            description="먹을 날짜를 고르고 입금하면 확정돼요"
          />
        )}
        {seasonal.examOpenCount > 0 && (
          <ListRow
            href={EXAMS_ROUTE}
            leading={<IconTile icon={GraduationCap} tone="violet" />}
            title="모의고사 신청"
            description={`접수 중인 시험 ${seasonal.examOpenCount}건`}
            trailing={<Badge tone="brand">접수 중</Badge>}
          />
        )}
      </Section>
    ) : null;

  /* 수행평가 */
  const tasksCard =
    isOnline || tasks.total > 0 ? (
      <Section
        key="tasks"
        title="수행평가"
        action={<SectionAction href="/(student)/(tabs)/tasks">전체</SectionAction>}>
        <Text variant="t10-bold" tabular>
          {tasks.done}
          <Text variant="t6-bold" color="neutralSubtle" tabular>
            {' '}
            / {tasks.total}건 완료
          </Text>
        </Text>
        <ProgressBar value={tasks.total ? tasks.done / tasks.total : 0} style={{ marginTop: space.x3 }} />
        {tasks.next && <NextTaskCard task={tasks.next} />}
      </Section>
    ) : null;

  /* 초기 설문 — 온라인 온보딩 전용, 제출 전까지만 */
  const surveyCard =
    survey && !survey.submitted ? (
      <Section key="survey">
        <View style={s.rowCenter}>
          <IconTile icon={FileText} tone="violet" size={48} />
          <View style={s.flex}>
            <Text variant="t6-bold">초기 설문</Text>
            <Text variant="t4-regular" color="neutralSubtle" tabular style={{ marginTop: space.x0_5 }}>
              {survey.filled === 0
                ? `${survey.total}개 질문 · 자동 저장돼요`
                : `${survey.filled} / ${survey.total} 작성`}
            </Text>
          </View>
        </View>
        <ProgressBar value={survey.total ? survey.filled / survey.total : 0} style={{ marginTop: space.x4 }} />
        <Button variant="weak" size="md" block href="/(student)/survey" style={{ marginTop: space.x4 }}>
          {survey.filled === 0 ? '설문 시작하기' : '이어서 작성하기'}
        </Button>
      </Section>
    ) : null;

  /* 포인트 */
  const pointsCard = (
    <Press key="points" href={POINTS_ROUTE} style={s.card} accessible={false}>
      <View style={s.between}>
        <Text variant="t5-medium" color="neutralMuted">
          내 포인트
        </Text>
        <ChevronRight color={color.fg.placeholder} size={20} strokeWidth={2} />
      </View>
      <View style={[s.between, { alignItems: 'flex-end', marginTop: space.x1, gap: space.x3 }]}>
        <View style={s.flex}>
          <Text variant="t10-bold" tabular numberOfLines={1}>
            {points.balance.toLocaleString('ko-KR')}점
          </Text>
          <Text variant="t4-regular" color="neutralSubtle" tabular style={{ marginTop: space.x0_5 }}>
            약 {points.krw.toLocaleString('ko-KR')}원 상당
          </Text>
        </View>
        <Button variant="gray" size="sm" href={POINTS_ROUTE}>
          교환하기
        </Button>
      </View>
    </Press>
  );

  /* 바로가기 — 태블릿 오른쪽 단은 폰 폭과 비슷해서 4칸 유지 */
  const shortcutCard = (
    <Section key="shortcuts" title="바로가기">
      <ShortcutGrid items={shortcuts} columns={isTablet ? 4 : undefined} />
    </Section>
  );

  const footNote = (
    <View key="foot" style={s.footNote}>
      <ShieldCheck color={color.fg.placeholder} size={14} strokeWidth={2} style={{ marginTop: 3 }} />
      <Text variant="t2-regular" color="placeholder" align="center" style={{ flexShrink: 1 }}>
        본인 계정 전용 앱이에요. 휴대폰을 다른 사람과 함께 쓰지 말고,{'\n'}의심되는 일이 생기면 바로
        원장님께 알려 주세요.
      </Text>
    </View>
  );

  if (isTablet) {
    return (
      <Stack>
        <Columns
          left={[greetingBlock, tasksCard, qnaCard, surveyCard]}
          right={[mentoringCard, seasonalCard, pointsCard, shortcutCard]}
        />
        {footNote}
      </Stack>
    );
  }

  // 폰 — 웹 포털 홈과 같은 순서
  return (
    <Stack>
      {greetingBlock}
      {mentoringCard}
      {qnaCard}
      {seasonalCard}
      {tasksCard}
      {surveyCard}
      {pointsCard}
      {shortcutCard}
      {footNote}
    </Stack>
  );
}

// ─── 가장 급한 과제 ───────────────────────────────────────────────────

function NextTaskCard({ task }: { task: NonNullable<StudentHomeResponse['tasks']['next']> }) {
  const due = dueInfo(task.dueDate);
  const st = TASK_STATUS[task.status];
  return (
    <Press href={`/(student)/tasks/${task.id}`} style={s.nextTask} accessibilityLabel={`가장 급한 과제, ${task.title}`}>
      <View style={s.flex}>
        <Text variant="t3-medium" color="neutralSubtle">
          가장 급한 과제
        </Text>
        <Text variant="t5-bold" numberOfLines={1} style={{ marginTop: space.x0_5 }}>
          {task.title}
        </Text>
        <View style={[s.rowCenter, { gap: space.x1, marginTop: space.x2 }]}>
          <Badge>{task.subject}</Badge>
          <Badge tone={st.tone}>{st.label}</Badge>
        </View>
      </View>
      <Badge tone={due.tone} size="md">
        {due.label}
      </Badge>
    </Press>
  );
}

// ─── 첫 로드 스켈레톤 ─────────────────────────────────────────────────

function HomeSkeleton({ isTablet }: { isTablet: boolean }) {
  const greetingSk = (
    <View key="greeting" style={[s.greeting, { gap: space.x2 }]}>
      <Skeleton style={{ width: 160, height: 18 }} />
      <Skeleton style={{ width: 240, height: 30 }} />
    </View>
  );
  const qnaSk = (
    <View key="qna" style={s.card}>
      <View style={[s.rowCenter, { gap: space.x4 }]}>
        <View style={[s.flex, { gap: space.x2 }]}>
          <Skeleton style={{ width: '70%', height: 20 }} />
          <Skeleton style={{ width: '90%', height: 16 }} />
        </View>
        <Skeleton style={{ width: 48, height: 48, borderRadius: 24 }} />
      </View>
      <Skeleton style={{ height: 40, marginTop: space.x4, borderRadius: radius.r2 }} />
    </View>
  );
  const tasksSk = (
    <View key="tasks" style={[s.card, { gap: space.x3 }]}>
      <Skeleton style={{ width: 80, height: 22 }} />
      <Skeleton style={{ width: 140, height: 34 }} />
      <Skeleton style={{ height: 8, borderRadius: radius.full }} />
      <Skeleton style={{ height: 76, marginTop: space.x1, borderRadius: radius.r4 }} />
    </View>
  );
  const pointsSk = (
    <View key="points" style={[s.card, { gap: space.x2 }]}>
      <Skeleton style={{ width: 70, height: 18 }} />
      <Skeleton style={{ width: 130, height: 34 }} />
    </View>
  );

  if (isTablet) {
    return (
      <Columns
        left={[greetingSk, tasksSk, qnaSk]}
        right={[
          pointsSk,
          <View key="shortcuts" style={[s.card, { gap: space.x4 }]}>
            <Skeleton style={{ width: 70, height: 22 }} />
            <View style={s.skeletonGrid}>
              {Array.from({ length: 8 }, (_, i) => (
                <View key={i} style={s.skeletonTile}>
                  <Skeleton style={{ width: 48, height: 48, borderRadius: radius.r4 }} />
                  <Skeleton style={{ width: 44, height: 14 }} />
                </View>
              ))}
            </View>
          </View>,
        ]}
      />
    );
  }

  return (
    <Stack>
      {greetingSk}
      {qnaSk}
      {tasksSk}
      {pointsSk}
    </Stack>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  greeting: { paddingHorizontal: space.x1, paddingTop: space.x2, paddingBottom: space.x3 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: space.x3_5 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { backgroundColor: color.bg.layerDefault, borderRadius: radius.r5, padding: space.x5 },
  softNote: {
    marginTop: space.x4,
    borderRadius: radius.r3_5,
    backgroundColor: color.bg.neutralWeak,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
  },
  moreSessions: {
    marginTop: space.x4,
    paddingTop: space.x3,
    borderTopWidth: 1,
    borderTopColor: color.stroke.neutralSubtle,
    gap: space.x1,
  },
  moreSession: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
    paddingVertical: space.x1_5,
  },
  nextTask: {
    marginTop: space.x4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    borderRadius: radius.r4,
    backgroundColor: color.bg.layerFill,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3_5,
  },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.x3 },
  skeletonTile: { width: '25%', alignItems: 'center', gap: space.x2, paddingVertical: space.x1 },
  footNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: space.x1_5,
    paddingHorizontal: space.x6,
    paddingTop: space.x5,
  },
});
