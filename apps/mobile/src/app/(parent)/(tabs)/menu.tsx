import { useRouter, type Href } from 'expo-router';
import {
  Bell,
  CalendarClock,
  Check,
  GraduationCap,
  LogOut,
  Megaphone,
  MessageSquareText,
  ShieldCheck,
  UserPlus,
  Utensils,
  type LucideIcon,
} from 'lucide-react-native';
import { Fragment, type ReactNode, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Avatar,
  Badge,
  color,
  confirm,
  Divider,
  IconTile,
  ListRow,
  Screen,
  Section,
  space,
  Stack,
  Text,
  toast,
  type Tone,
} from '@/design';
import { useChildQuery } from '@/features/parent/child-query';
import {
  parentServicePaths,
  type ParentLunchSummary,
  type ParentServicesSummary,
} from '@/lib/api/parent-services';
import { refreshBadges } from '@/lib/badges';
import { childMeta, useParentChild } from '@/lib/parent-child';
import { useSession } from '@/lib/session';

// 학부모 전체 탭 — 프로필(연결된 자녀) → 신청 · 소통 → 앱 설정 → 로그아웃.
// 학생 앱 전체 탭과 같은 문법(흰 카드 + ListRow + IconTile).

// 다른 에이전트가 만드는 화면 — typed routes 생성 전에도 컴파일되도록 Href 로 고정
const ROUTES = {
  lunch: '/(parent)/lunch' as Href,
  schedule: '/(parent)/schedule' as Href,
  exams: '/(parent)/exams' as Href,
  inquiries: '/(parent)/inquiries' as Href,
  notices: '/(parent)/notices' as Href,
  linkChild: '/(parent)/link-child' as Href,
  notifications: '/notifications' as Href,
  account: '/account' as Href,
};

const LUNCH_TRAILING: Record<ParentLunchSummary, { label: string; tone: Tone } | null> = {
  closed: null,
  open: { label: '신청 가능', tone: 'ok' },
  unpaid: { label: '입금 대기', tone: 'warn' },
  claimed: { label: '입금 확인 중', tone: 'warn' },
  confirmed: { label: '신청 확정', tone: 'ok' },
};

type Item = {
  href: Href;
  label: string;
  description?: string;
  icon: LucideIcon;
  tone: Tone;
  trailing?: ReactNode;
};

export default function ParentMenuScreen() {
  const { session } = useSession();
  const { children: kids, selected, select } = useParentChild();
  const childId = selected?.id ?? null;
  const summary = useChildQuery<ParentServicesSummary>(
    childId ? parentServicePaths.summary(childId) : null,
    childId,
  );
  const sum = summary.data;
  const parentName = session?.displayName?.trim() || '학부모';

  const lunchTrailing = sum ? LUNCH_TRAILING[sum.lunch] : null;
  const apply: Item[] = [
    {
      href: ROUTES.lunch,
      label: '점심 도시락',
      description: sum?.lunch === 'closed' ? '메뉴가 올라오면 신청할 수 있어요' : '주간 메뉴 신청 · 입금 안내',
      icon: Utensils,
      tone: 'warn',
      trailing: lunchTrailing ? <Badge tone={lunchTrailing.tone}>{lunchTrailing.label}</Badge> : undefined,
    },
    {
      href: ROUTES.schedule,
      label: '등원 스케줄',
      description: '주간 등하원·학원 일정 확인과 승인',
      icon: CalendarClock,
      tone: 'ok',
      trailing: sum?.schedule.pendingProposal ? (
        <Badge tone="brand" solid>
          승인 필요
        </Badge>
      ) : undefined,
    },
    {
      href: ROUTES.exams,
      label: '모의고사 신청',
      description: '응시 신청 · 확정 · 좌석 확인',
      icon: GraduationCap,
      tone: 'violet',
      trailing: sum ? (
        sum.exams.openCount > 0 ? (
          <Text variant="t4-medium" color="neutralSubtle" tabular>
            접수 중 {sum.exams.openCount}건
          </Text>
        ) : sum.exams.appliedCount > 0 ? (
          <Text variant="t4-medium" color="neutralSubtle" tabular>
            신청 {sum.exams.appliedCount}건
          </Text>
        ) : undefined
      ) : undefined,
    },
  ];

  const talk: Item[] = [
    {
      href: ROUTES.inquiries,
      label: '원장님께 문의',
      description: '상담 요청 · 출결 · 학습 문의',
      icon: MessageSquareText,
      tone: 'brand',
      trailing:
        sum && sum.inquiries.waitingCount > 0 ? (
          <Text variant="t4-medium" color="neutralSubtle" tabular>
            확인 대기 {sum.inquiries.waitingCount}
          </Text>
        ) : undefined,
    },
    {
      href: ROUTES.notices,
      label: '공지사항',
      description: '독서실 소식 · 이달의 입시 정보',
      icon: Megaphone,
      tone: 'info',
    },
  ];

  return (
    <Screen
      kind="tab"
      title="전체"
      refreshing={summary.isRefreshing}
      onRefresh={() => {
        refreshBadges();
        void summary.refresh();
      }}>
      <Stack>
        {/* 프로필 + 연결된 자녀 */}
        <Section>
          <View style={s.profile}>
            <Avatar name={parentName} size={56} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="t7-bold" numberOfLines={1}>
                {parentName} 님
              </Text>
              <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1} style={{ marginTop: space.x0_5 }}>
                학부모 계정 · 자녀 {kids.length}명
              </Text>
            </View>
          </View>
        </Section>

        <Section title="연결된 자녀" flush>
          {kids.map((kid, i) => {
            const on = kid.id === childId;
            return (
              <Fragment key={kid.id}>
                {i > 0 && <Divider inset={space.x5} />}
                <ListRow
                  onPress={kids.length > 1 ? () => select(kid.id) : undefined}
                  leading={<Avatar name={kid.name} size={40} />}
                  title={kid.name}
                  description={childMeta(kid) || undefined}
                  chevron={false}
                  trailing={
                    kids.length > 1 ? (
                      on ? (
                        <View style={s.selected}>
                          <Check size={16} strokeWidth={2.6} color={color.fg.brand} />
                          <Text variant="t4-bold" color="brand">
                            보는 중
                          </Text>
                        </View>
                      ) : (
                        <Text variant="t4-medium" color="neutralSubtle">
                          보기
                        </Text>
                      )
                    ) : undefined
                  }
                />
              </Fragment>
            );
          })}
          <ListRow
            href={ROUTES.linkChild}
            leading={<IconTile icon={UserPlus} tone="gray" />}
            title="자녀 추가 연결"
            description="독서실에서 받은 초대 코드가 필요해요"
          />
        </Section>

        <MenuSection title="신청" items={apply} />
        <MenuSection title="소통" items={talk} />
        <AppSection />

        <Text variant="t2-regular" color="placeholder" align="center" style={s.footNote}>
          학부모님 본인 계정 전용 앱이에요. 다른 사람이 쓰는 기기라면{'\n'}다 쓴 뒤 꼭 로그아웃해 주세요.
        </Text>
      </Stack>
    </Screen>
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
          trailing={it.trailing}
        />
      ))}
    </Section>
  );
}

/** 앱 설정 — 알림 · 계정·보안 · 로그아웃 */
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
    <Section title="설정" flush>
      <ListRow
        href={ROUTES.notifications}
        leading={<IconTile icon={Bell} tone="gray" />}
        title="알림 설정"
        description="입퇴실 · 리포트 · 스케줄 알림"
      />
      <ListRow
        href={ROUTES.account}
        leading={<IconTile icon={ShieldCheck} tone="gray" />}
        title="계정·보안"
        description="로그인 정보, 기기 보안"
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

const s = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.x4 },
  selected: { flexDirection: 'row', alignItems: 'center', gap: space.x1 },
  footNote: { paddingHorizontal: space.x6, paddingTop: space.x5 },
});
