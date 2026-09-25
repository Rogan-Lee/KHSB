import {
  CalendarDays,
  CircleCheck,
  CircleQuestionMark,
  ClipboardList,
  BookOpenCheck,
  MessageCircle,
  MessageSquareText,
  NotebookPen,
  ScanLine,
  Stamp,
  TriangleAlert,
  Utensils,
  Video,
  type LucideIcon,
} from 'lucide-react-native';
import type { Href } from 'expo-router';
import { Linking, View } from 'react-native';

import {
  Avatar,
  Badge,
  Button,
  ErrorState,
  HeaderIconButton,
  IconTile,
  ListRow,
  Notice,
  Screen,
  Section,
  SectionAction,
  Skeleton,
  Stack,
  StatGrid,
  Text,
  space,
  toast,
  type Tone,
} from '@/design';
import { errorText, useOptimistic, usePullRefresh, useStaffCaps } from '@/features/staff-home/hooks';
import {
  addDaysKey,
  dueLabel,
  formatDateKey,
  greetingText,
  kstKeyOf,
  kstTime,
  kstTodayKey,
} from '@/features/staff-home/format';
import { STAFF_DEST, canOpen, route, type StaffDest } from '@/features/staff-home/links';
import {
  CheckRow,
  EventRow,
  ListSkeleton,
  MentorShiftList,
  ShortcutGrid,
  StatSkeleton,
  type Shortcut,
} from '@/features/staff-home/ui';
import { setTodoCompleted, STAFF_API, type StaffTodayResponse } from '@/lib/api/staff-home';
import { refreshBadges } from '@/lib/badges';
import type { StaffCapabilities } from '@/lib/capabilities';
import { useMobileQuery } from '@/lib/mobile-api';
import { useResponsive } from '@/lib/responsive';
import { useSession } from '@/lib/session';

type Priority = {
  key: string;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  description: string;
  count: number;
  href: Href;
};

function buildPriorities(p: StaffTodayResponse['priorities'], caps: StaffCapabilities): Priority[] {
  const rows: (Priority | false)[] = [
    !!p.approvals &&
      canOpen(caps, 'approvals') && {
        key: 'approvals',
        icon: Stamp,
        tone: 'brand',
        title: '승인 대기',
        description: '쪽잠·네트워크·포인트·모의고사 신청',
        count: p.approvals,
        href: STAFF_DEST.approvals.href,
      },
    !!p.openQuestions &&
      caps.offlineOps && {
        key: 'questions',
        icon: CircleQuestionMark,
        tone: 'warn',
        title: '답변 대기 질문',
        description: '학생이 답변을 기다리고 있어요',
        count: p.openQuestions,
        href: route('/(staff)/(tabs)/inbox'),
      },
    !!p.mentoringRecords &&
      caps.offlineOps && {
        key: 'mentoring',
        icon: NotebookPen,
        tone: 'violet',
        title: '기록이 필요한 멘토링',
        description: '끝난 멘토링의 상담 기록을 남겨 주세요',
        count: p.mentoringRecords,
        href: route('/(staff)/(tabs)/mentoring'),
      },
    !!p.lunchRequests &&
      canOpen(caps, 'lunch') && {
        key: 'lunch',
        icon: Utensils,
        tone: 'warn',
        title: '점심 변경 요청',
        description: '학부모 요청에 반영 내용을 답해 주세요',
        count: p.lunchRequests,
        href: route('/(staff)/lunch?tab=requests'),
      },
    !!p.unreadHandovers &&
      canOpen(caps, 'handover') && {
        key: 'handover',
        icon: ClipboardList,
        tone: 'info',
        title: '확인 안 한 인수인계',
        description: '최근 2주 인수인계를 확인해 주세요',
        count: p.unreadHandovers,
        href: STAFF_DEST.handover.href,
      },
    !!p.suggestions &&
      canOpen(caps, 'suggestions') && {
        key: 'suggestions',
        icon: MessageSquareText,
        tone: 'warn',
        title: '새 건의사항',
        description: '접수된 건의를 검토해 주세요',
        count: p.suggestions,
        href: STAFF_DEST.suggestions.href,
      },
    !!p.tasksNeedFeedback &&
      canOpen(caps, 'tasks') && {
        key: 'tasks',
        icon: BookOpenCheck,
        tone: 'info',
        title: '피드백 대기 수행평가',
        description: '학생이 제출한 과제를 확인해 주세요',
        count: p.tasksNeedFeedback,
        href: STAFF_DEST.tasks.href,
      },
    !!p.unreadMessages && {
      key: 'messages',
      icon: MessageCircle,
      tone: 'info',
      title: '안 읽은 메시지',
      description: '학생·직원 메시지를 확인해 주세요',
      count: p.unreadMessages,
      href: route('/(staff)/(tabs)/inbox'),
    },
  ];
  return rows.filter((r): r is Priority => !!r);
}

function dayWord(key: string, today: string) {
  if (key === today) return '오늘';
  if (key === addDaysKey(today, 1)) return '내일';
  return formatDateKey(key);
}

const SHORTCUT_ORDER: StaffDest[] = [
  'students',
  'seatMap',
  'phoneCheck',
  'patrol',
  'handover',
  'announcements',
  'calendar',
  'tasks',
  'inbox',
  'work',
];

export default function StaffHomeScreen() {
  const { session } = useSession();
  const caps = useStaffCaps();
  const { isTablet } = useResponsive();
  const { data, error, isLoading, refresh, retry } = useMobileQuery<StaffTodayResponse>(STAFF_API.today);
  const { refreshing, onRefresh } = usePullRefresh(async () => {
    refreshBadges();
    await refresh();
  });
  const [todoOver, setTodoOver] = useOptimistic<boolean>(data);

  const name = session?.displayName ?? '선생님';

  async function toggleTodo(id: string, next: boolean) {
    setTodoOver(id, next);
    try {
      await setTodoCompleted(id, next);
      toast(next ? '할 일을 끝냈어요' : '할 일을 되돌렸어요', 'success');
      void refresh();
    } catch (e) {
      setTodoOver(id, undefined);
      toast(errorText(e, '할 일을 저장하지 못했어요'), 'error');
    }
  }

  const header = (
    <HeaderIconButton icon={CalendarDays} href="/(staff)/calendar" label="일정 보기" />
  );

  if (!data || !caps) {
    return (
      <Screen kind="home" right={header} onRefresh={onRefresh} refreshing={refreshing}>
        {error && !isLoading ? (
          <ErrorState message={error} onRetry={() => void retry()} />
        ) : (
          <Stack>
            <View style={{ paddingHorizontal: space.x1, paddingTop: space.x2, paddingBottom: space.x3, gap: space.x2 }}>
              <Skeleton style={{ width: 160, height: 18 }} />
              <Skeleton style={{ width: 220, height: 28 }} />
            </View>
            <StatSkeleton />
            <ListSkeleton rows={3} />
            <ListSkeleton rows={2} />
          </Stack>
        )}
      </Screen>
    );
  }

  const priorities = buildPriorities(data.priorities, caps);
  const pending = priorities.reduce((sum, p) => sum + p.count, 0);
  const today = data.date || kstTodayKey();

  const shortcuts: Shortcut[] = SHORTCUT_ORDER.filter((k) => canOpen(caps, k))
    .slice(0, 8)
    .map((k) => ({
      key: k,
      label: k === 'inbox' ? '메시지' : (STAFF_DEST[k].short ?? STAFF_DEST[k].label),
      icon: k === 'inbox' ? MessageCircle : STAFF_DEST[k].icon,
      tone: STAFF_DEST[k].tone,
      href: STAFF_DEST[k].href,
      badge:
        k === 'handover'
          ? (data.priorities.unreadHandovers ?? 0)
          : k === 'patrol'
            ? data.patrol
              ? 1
              : 0
            : k === 'inbox'
              ? (data.priorities.unreadMessages ?? 0)
              : 0,
    }));

  // ── 카드들 ──
  const greeting = (
    <View key="greeting" style={{ paddingHorizontal: space.x1, paddingTop: space.x2, paddingBottom: space.x3 }}>
      <Text variant="t5-medium" color="neutralSubtle">
        {name}님, {greetingText()}
      </Text>
      <Text variant="t9-bold" style={{ marginTop: space.x1 }}>
        {pending > 0 ? `처리할 일이 ${pending}건 있어요` : '지금은 처리할 일이 없어요'}
      </Text>
      <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x1 }}>
        {formatDateKey(today, 'long')}
      </Text>
    </View>
  );

  const failedNotice =
    data.failed.length > 0 ? (
      <Notice key="failed" tone="warn" icon={TriangleAlert}>
        일부 정보를 불러오지 못했어요. 당겨서 새로고침해 주세요.
      </Notice>
    ) : null;

  const patrolCard = data.patrol ? (
    <Section key="patrol-card" flush>
      <ListRow
        href={STAFF_DEST.patrol.href}
        leading={<IconTile icon={ScanLine} tone="info" solid size={44} />}
        meta={<Badge tone="info">순찰 진행 중</Badge>}
        title={`${data.patrol.checkedCount} / ${data.patrol.rosterCount}명 점검했어요`}
        description={`${kstTime(data.patrol.startedAt)} 시작 · ${data.patrol.patrollerName}`}
      />
    </Section>
  ) : null;

  const attendanceCard = data.attendance ? (
    <Section
      key="attendance"
      title="지금 자습실"
      description={`재원생 ${data.attendance.total}명${data.attendance.absent > 0 ? ` · 결석 ${data.attendance.absent}명` : ''}`}
      action={<SectionAction href={route('/(staff)/(tabs)/attendance')}>입퇴실</SectionAction>}>
      <StatGrid
        items={[
          { label: '재실', value: data.attendance.present, tone: 'positive' },
          { label: '외출', value: data.attendance.away, tone: data.attendance.away > 0 ? 'informative' : 'neutral' },
          { label: '미입실', value: data.attendance.notArrived },
          { label: '지각', value: data.attendance.late, tone: data.attendance.late > 0 ? 'critical' : 'neutral' },
        ]}
      />
    </Section>
  ) : null;

  const priorityCard = (
    <Section
      key="priorities"
      title="지금 처리할 일"
      action={pending > 0 ? <Badge tone="brand" size="md">{`${pending}건`}</Badge> : undefined}
      flush>
      {priorities.length > 0 ? (
        priorities.map((p) => (
          <ListRow
            key={p.key}
            href={p.href}
            leading={<IconTile icon={p.icon} tone={p.tone} />}
            title={p.title}
            description={p.description}
            trailing={
              <Text variant="t5-bold" color="brand" tabular>
                {p.count}건
              </Text>
            }
          />
        ))
      ) : (
        <ListRow
          leading={<IconTile icon={CircleCheck} tone="ok" />}
          title="모두 처리했어요"
          description="새 요청이 오면 여기에 모아서 보여 드릴게요"
        />
      )}
    </Section>
  );

  const shortcutCard =
    shortcuts.length > 0 ? (
      <Section key="shortcuts" title="바로가기">
        <ShortcutGrid items={shortcuts} />
      </Section>
    ) : null;

  const sessionsCard =
    data.sessions && data.sessions.length > 0 ? (
      <Section key="sessions" title="화상 관리 일정" flush>
        {data.sessions.map((s) => (
          <ListRow
            key={s.id}
            leading={<IconTile icon={Video} tone={s.inProgress ? 'brand' : 'info'} solid={s.inProgress} />}
            meta={s.inProgress ? <Badge tone="brand">진행 중</Badge> : undefined}
            title={`${s.studentName} · ${s.grade}`}
            description={`${dayWord(kstKeyOf(s.scheduledAt), today)} ${kstTime(s.scheduledAt)} · ${s.durationMinutes}분`}
            trailing={
              s.meetUrl ? (
                <Button
                  size="xs"
                  variant={s.inProgress ? 'primary' : 'gray'}
                  accessibilityLabel={`${s.studentName} Meet 입장`}
                  onPress={() => {
                    void Linking.openURL(s.meetUrl!).catch(() => toast('링크를 열지 못했어요', 'error'));
                  }}>
                  입장
                </Button>
              ) : undefined
            }
          />
        ))}
      </Section>
    ) : null;

  const attentionCard =
    data.attention && data.attention.total > 0 ? (
      <Section
        key="attention"
        title="주의 학생"
        description="결석·지각·벌점·미완료 과제로 눈여겨볼 학생이에요"
        action={
          data.attention.total > data.attention.items.length ? (
            <Text variant="t4-medium" color="neutralSubtle" tabular>
              {`총 ${data.attention.total}명`}
            </Text>
          ) : undefined
        }
        flush>
        {data.attention.items.map((st) => (
          <ListRow
            key={st.studentId}
            href={canOpen(caps, 'students') ? route(`/(staff)/students/${st.studentId}`) : undefined}
            align="start"
            leading={<Avatar name={st.name} size={40} />}
            meta={
              <>
                {st.isManual && <Badge tone="violet">직접 지정</Badge>}
                <Badge tone={st.severity === 'high' ? 'bad' : 'warn'}>
                  {st.severity === 'high' ? '주의 높음' : '관찰 필요'}
                </Badge>
              </>
            }
            title={`${st.name} · ${st.grade}${st.seat ? ` · ${st.seat}번` : ''}`}
            description={
              <Text variant="t4-regular" color="neutralSubtle" numberOfLines={2}>
                {st.reasons.join(' · ')}
              </Text>
            }
          />
        ))}
      </Section>
    ) : null;

  const events = data.events?.items ?? [];
  const mentors = data.workingMentors ?? [];
  const scheduleCard =
    data.events || data.workingMentors ? (
      <Section
        key="schedule"
        title="오늘 일정"
        action={<SectionAction href={STAFF_DEST.calendar.href}>전체</SectionAction>}>
        {events.length === 0 && mentors.length === 0 ? (
          <Text variant="t4-regular" color="neutralSubtle">
            오늘 등록된 일정이 없어요
          </Text>
        ) : (
          <Stack gap={space.x3}>
            {events.length > 0 && (
              <View>
                {events.map((e) => (
                  <EventRow key={e.id} event={e} dayKey={today} />
                ))}
                {(data.events?.total ?? 0) > events.length && (
                  <Text variant="t3-regular" color="neutralSubtle" style={{ paddingTop: space.x1 }}>
                    {`외 ${(data.events?.total ?? 0) - events.length}건은 일정에서 볼 수 있어요`}
                  </Text>
                )}
              </View>
            )}
            {mentors.length > 0 && (
              <View style={{ gap: space.x2 }}>
                <Text variant="t4-bold" color="neutralMuted">
                  오늘 근무 멘토
                </Text>
                <MentorShiftList mentors={mentors} />
              </View>
            )}
          </Stack>
        )}
      </Section>
    ) : null;

  const todos = data.todos;
  const todoCard =
    todos && todos.total > 0 ? (
      <Section
        key="todos"
        title="내 할 일"
        action={
          <Text variant="t4-medium" color="neutralSubtle" tabular>
            {`${todos.total}개`}
          </Text>
        }
        flush>
        {todos.items.map((t) => {
          const checked = todoOver[t.id] ?? false;
          const due = t.dueDate ? dueLabel(t.dueDate, today) : null;
          const desc = [due?.label, t.category, t.assignedBy ? `${t.assignedBy}님 요청` : null]
            .filter(Boolean)
            .join(' · ');
          return (
            <CheckRow
              key={t.id}
              checked={checked}
              onPress={() => void toggleTodo(t.id, !checked)}
              title={t.title}
              meta={
                t.priority === 'URGENT' || t.priority === 'HIGH' || due?.overdue ? (
                  <>
                    {t.priority === 'URGENT' && <Badge tone="bad">긴급</Badge>}
                    {t.priority === 'HIGH' && <Badge tone="warn">중요</Badge>}
                    {due?.overdue && <Badge tone="bad">기한 지남</Badge>}
                  </>
                ) : undefined
              }
              description={desc || undefined}
            />
          );
        })}
        {todos.total > todos.items.length && (
          <Text variant="t3-regular" color="neutralSubtle" style={{ paddingHorizontal: space.x5, paddingTop: space.x1 }}>
            {`외 ${todos.total - todos.items.length}개는 웹 할 일 목록에서 볼 수 있어요`}
          </Text>
        )}
      </Section>
    ) : null;

  // 폰: 한 줄로 쌓기 · 태블릿: 왼쪽(지금 할 일) / 오른쪽(학생·일정) 두 칸
  const left = [failedNotice, patrolCard, attendanceCard, priorityCard, shortcutCard, sessionsCard].filter(Boolean);
  const right = [attentionCard, scheduleCard, todoCard].filter(Boolean);

  return (
    <Screen
      kind="home"
      right={header}
      refreshing={refreshing}
      onRefresh={onRefresh}
      maxWidth={isTablet ? 1040 : undefined}>
      {greeting}
      {isTablet ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 }}>
          <Stack style={{ flex: 1, minWidth: 0 }}>{left}</Stack>
          <Stack style={{ flex: 1, minWidth: 0 }}>{right}</Stack>
        </View>
      ) : (
        <Stack>{[...left, ...right]}</Stack>
      )}
    </Screen>
  );
}
