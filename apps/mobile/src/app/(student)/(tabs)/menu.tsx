import { useRouter, type Href } from 'expo-router';
import {
  Bell,
  CalendarDays,
  CircleHelp,
  ClipboardCheck,
  Coins,
  FileText,
  GraduationCap,
  Headset,
  LogOut,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Moon,
  Podcast,
  ShieldCheck,
  SpellCheck,
  Utensils,
  Wifi,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Avatar,
  Badge,
  color,
  Columns,
  confirm,
  CountBadge,
  ErrorState,
  IconTile,
  ListRow,
  radius,
  Screen,
  Section,
  Skeleton,
  space,
  Stack,
  TABLET_WIDE,
  Text,
  toast,
  useResponsive,
  type Tone,
} from '@/design';
import { STUDENT_HOME_PATH, type StudentHomeResponse } from '@/lib/api/student-home';
import { refreshBadges } from '@/lib/badges';
import { useMobileQuery } from '@/lib/mobile-api';
import { useSession } from '@/lib/session';
import { SUPPORT_URL, openHelpPage } from '@/lib/support';

// 웹 학생 포털 전체 탭(/s/[token]/menu)과 같은 구성: 프로필 → 학습 · 소통 · 생활 · 혜택 → 앱 설정.
// 모든 항목이 앱 화면으로 열린다(포털 웹뷰 없음).
// 태블릿(≥700): 프로필 아래로 두 단 — 왼쪽 학습·생활, 오른쪽 소통·혜택·앱 설정.

// 다른 에이전트가 만드는 화면 — typed routes 생성 전에도 컴파일되도록 Href 로 고정
const ACCOUNT_ROUTE = '/account' as Href;
const POINTS_ROUTE = '/(student)/points' as Href;
const NAP_ROUTE = '/(student)/nap' as Href;
const NETWORK_ROUTE = '/(student)/network' as Href;
const SCHEDULE_ROUTE = '/(student)/schedule' as Href;
const EXAMS_ROUTE = '/(student)/exams' as Href;
const LUNCH_ROUTE = '/(student)/lunch' as Href;
const CONTENTS_ROUTE = '/(student)/contents' as Href;

type Item = {
  href: Href;
  label: string;
  description?: string;
  icon: LucideIcon;
  tone: Tone;
  badge?: number;
  value?: string;
};

export default function StudentMenuScreen() {
  const { session } = useSession();
  const { isTablet } = useResponsive();
  const { data, error, isRefreshing, refresh, retry } =
    useMobileQuery<StudentHomeResponse>(STUDENT_HOME_PATH);

  let body;
  if (data) {
    body = <MenuContent data={data} fallbackName={session?.displayName ?? '학생'} isTablet={isTablet} />;
  } else if (isTablet) {
    // 불러오지 못해도 알림 설정·계정·로그아웃은 늘 쓸 수 있게 (오른쪽 단)
    body = error ? (
      <Columns
        leftFlex={1}
        left={<ErrorState message={error} onRetry={() => void retry()} />}
        right={<AppSection />}
      />
    ) : (
      <Stack>
        <ProfileSkeleton />
        <Columns
          leftFlex={1}
          left={[<SectionSkeleton key="a" rows={3} />, <SectionSkeleton key="b" rows={3} />]}
          right={[<SectionSkeleton key="c" rows={3} />, <AppSection key="app" />]}
        />
      </Stack>
    );
  } else {
    body = (
      // 불러오지 못해도 알림 설정·계정·로그아웃은 늘 쓸 수 있게
      <Stack>
        {error ? <ErrorState message={error} onRetry={() => void retry()} /> : <MenuSkeleton />}
        <AppSection />
      </Stack>
    );
  }

  return (
    <Screen
      kind="tab"
      title="전체"
      maxWidth={isTablet ? TABLET_WIDE : undefined}
      refreshing={isRefreshing}
      onRefresh={() => {
        refreshBadges();
        void refresh();
      }}>
      {body}
    </Screen>
  );
}

function MenuContent({
  data,
  fallbackName,
  isTablet,
}: {
  data: StudentHomeResponse;
  fallbackName: string;
  isTablet: boolean;
}) {
  const { badges, student, survey, seasonal } = data;
  const name = student.name || fallbackName;
  const profileSub = [student.school, student.grade].filter(Boolean).join(' · ');

  const study: Item[] = [
    { href: '/(student)/(tabs)/tasks', label: '수행평가', icon: ClipboardCheck, tone: 'info', badge: badges.tasks },
    { href: '/(student)/feedback', label: '받은 피드백', icon: MessageCircle, tone: 'brand', badge: badges.feedback },
  ];
  if (badges.hasVocab)
    study.push({ href: '/(student)/vocab', label: '영단어 시험', icon: SpellCheck, tone: 'info', badge: badges.vocab });
  if (survey)
    study.push({
      href: '/(student)/survey',
      label: '초기 설문',
      icon: FileText,
      tone: 'violet',
      value: survey.submitted ? '제출 완료' : `${survey.filled}/${survey.total}`,
    });

  const talk: Item[] = [
    {
      href: '/(student)/(tabs)/qna',
      label: '질문하기',
      description: '모르는 문제를 사진으로 물어봐요',
      icon: CircleHelp,
      tone: 'brand',
      badge: badges.qna,
    },
    {
      href: '/(student)/(tabs)/chat',
      label: '메시지',
      description: '담당 선생님과 1:1 대화',
      icon: MessageSquare,
      tone: 'info',
      badge: badges.chat,
    },
    {
      href: '/(student)/suggestions',
      label: '건의사항',
      description: '불편한 점, 바라는 점을 알려 주세요',
      icon: Megaphone,
      tone: 'warn',
      badge: badges.suggestions,
    },
  ];

  const life: Item[] = [
    { href: SCHEDULE_ROUTE, label: '내 일정 · 등원 스케줄', icon: CalendarDays, tone: 'ok' },
    {
      href: NAP_ROUTE,
      label: '쪽잠 신청',
      description: '하루 2회 · 20~30분',
      icon: Moon,
      tone: 'violet',
    },
    {
      href: NETWORK_ROUTE,
      label: '네트워크 사용 신청',
      description: '와이파이·사이트·앱',
      icon: Wifi,
      tone: 'info',
    },
  ];
  if (seasonal.lunchOpen)
    life.push({ href: LUNCH_ROUTE, label: '점심 도시락', icon: Utensils, tone: 'warn', value: '신청 가능' });
  if (seasonal.examOpenCount > 0)
    life.push({
      href: EXAMS_ROUTE,
      label: '모의고사 신청',
      icon: GraduationCap,
      tone: 'violet',
      value: `접수 중 ${seasonal.examOpenCount}건`,
    });

  const perks: Item[] = [
    {
      href: POINTS_ROUTE,
      label: '포인트',
      icon: Coins,
      tone: 'brand',
      value: `${data.points.balance.toLocaleString('ko-KR')}점`,
    },
  ];
  if (data.contentCount > 0)
    perks.push({
      href: CONTENTS_ROUTE,
      label: '콘텐츠',
      description: '후기·칼럼·팟캐스트',
      icon: Podcast,
      tone: 'violet',
    });

  const profile = (
    <Section>
      <View style={s.profile}>
        <Avatar name={name} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="t7-bold" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1} style={{ marginTop: space.x0_5 }}>
            {profileSub || '강한선배 학생'}
          </Text>
        </View>
        {student.isOnlineManaged && <Badge tone="brand">온라인 관리</Badge>}
      </View>
    </Section>
  );

  const footNote = (
    <Text variant="t2-regular" color="placeholder" align="center" style={s.footNote}>
      본인 계정 전용 앱이에요. 다른 사람이 쓰는 기기라면{'\n'}다 쓴 뒤 꼭 로그아웃해 주세요.
    </Text>
  );

  if (isTablet) {
    return (
      <Stack>
        {profile}
        <Columns
          leftFlex={1}
          left={[
            <MenuSection key="study" title="학습" items={study} />,
            <MenuSection key="life" title="생활" items={life} />,
          ]}
          right={[
            <MenuSection key="talk" title="소통" items={talk} />,
            <MenuSection key="perks" title="혜택" items={perks} />,
            <AppSection key="app" />,
          ]}
        />
        {footNote}
      </Stack>
    );
  }

  // 폰 — 웹 포털 전체 탭과 같은 순서
  return (
    <Stack>
      {profile}
      <MenuSection title="학습" items={study} />
      <MenuSection title="소통" items={talk} />
      <MenuSection title="생활" items={life} />
      <MenuSection title="혜택" items={perks} />
      <AppSection />
      {footNote}
    </Stack>
  );
}

function MenuSection({ title, items }: { title: string; items: Item[] }) {
  return (
    <Section title={title} flush>
      {items.map((it) => (
        <ListRow
          key={it.label}
          href={it.href}
          leading={<IconTile icon={it.icon} tone={it.tone} />}
          title={it.label}
          description={it.description}
          trailing={
            (it.badge ?? 0) > 0 ? (
              <CountBadge count={it.badge!} />
            ) : it.value ? (
              <Text variant="t4-medium" color="neutralSubtle" tabular>
                {it.value}
              </Text>
            ) : undefined
          }
        />
      ))}
    </Section>
  );
}

/** 앱 설정 — 알림 · 계정·보안 · 로그아웃 (웹 포털에는 없는 앱 전용 묶음) */
function AppSection() {
  const router = useRouter();
  const { signOut } = useSession();
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    if (busy) return;
    const ok = await confirm({
      title: '로그아웃할까요?',
      message: '다시 이용하려면 로그인해야 해요.',
      confirmText: '로그아웃',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await signOut();
      router.replace('/(auth)');
    } catch (e) {
      toast(e instanceof Error ? e.message : '로그아웃하지 못했어요.', 'error');
      setBusy(false);
    }
  };

  return (
    <Section title="앱 설정" flush>
      <ListRow
        href="/notifications"
        leading={<IconTile icon={Bell} tone="gray" />}
        title="알림 설정"
        description="과제·답변·멘토링 알림"
      />
      <ListRow
        href={ACCOUNT_ROUTE}
        leading={<IconTile icon={ShieldCheck} tone="gray" />}
        title="계정·보안"
        description="로그인 정보 · 비밀번호 · 회원 탈퇴"
      />
      <ListRow
        onPress={() => void openHelpPage(SUPPORT_URL)}
        leading={<IconTile icon={Headset} tone="gray" />}
        title="고객센터"
        description="자주 묻는 질문 · 문의 방법"
      />
      <ListRow
        onPress={() => void logout()}
        leading={<IconTile icon={LogOut} tone="bad" />}
        title={
          <Text variant="t5-medium" color="critical">
            로그아웃
          </Text>
        }
        chevron={false}
      />
    </Section>
  );
}

function MenuSkeleton() {
  return (
    <Stack>
      <ProfileSkeleton />
      {[3, 3, 3].map((rows, i) => (
        <SectionSkeleton key={i} rows={rows} />
      ))}
    </Stack>
  );
}

function ProfileSkeleton() {
  return (
    <View style={[s.card, s.profile]}>
      <Skeleton style={{ width: 56, height: 56, borderRadius: 28 }} />
      <View style={{ flex: 1, gap: space.x2 }}>
        <Skeleton style={{ width: 90, height: 22 }} />
        <Skeleton style={{ width: 140, height: 16 }} />
      </View>
    </View>
  );
}

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <View style={[s.card, { gap: space.x4 }]}>
      <Skeleton style={{ width: 48, height: 20 }} />
      {Array.from({ length: rows }).map((_, j) => (
        <View key={j} style={s.skeletonRow}>
          <Skeleton style={{ width: 40, height: 40, borderRadius: radius.r3 }} />
          <Skeleton style={{ flex: 1, height: 18 }} />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.x4 },
  card: { backgroundColor: color.bg.layerDefault, borderRadius: radius.r5, padding: space.x5 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  footNote: { paddingHorizontal: space.x6, paddingTop: space.x5 },
});
