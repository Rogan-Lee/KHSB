import Constants from 'expo-constants';
import { router } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { View } from 'react-native';

import {
  Avatar,
  Badge,
  CountBadge,
  IconTile,
  ListRow,
  Screen,
  Section,
  Stack,
  Text,
  confirm,
  space,
  toast,
} from '@/design';
import { useOptionalQuery, useStaffCaps } from '@/features/staff-home/hooks';
import { ROLE_LABEL, STAFF_DEST, canOpen, type StaffDest } from '@/features/staff-home/links';
import { STAFF_API, type StaffOperationsResponse } from '@/lib/api/staff-home';
import { useStaffBadges } from '@/lib/badges';
import { useResponsive } from '@/lib/responsive';
import { useSession } from '@/lib/session';

type Row = {
  dest: StaffDest;
  label?: string;
  description?: string;
  badge?: number;
  value?: string;
  valueTone?: 'brand' | 'positive' | 'neutralSubtle';
};

/** 직원 전체 탭 — 모든 기능 목록. 행은 capabilities 로만 노출(권한 없는 행은 아예 그리지 않음). */
export default function StaffMenuScreen() {
  const { session, signOut } = useSession();
  const caps = useStaffCaps();
  const badges = useStaffBadges();
  const { isTablet } = useResponsive();
  // 순찰·근무 상태 요약 — 오프라인 운영진만 (/staff/operations 는 requireMobileStaff)
  const ops = useOptionalQuery<StaffOperationsResponse>(
    caps?.offlineOps ? STAFF_API.operations : null
  );

  const role = session?.staffRole ? (ROLE_LABEL[session.staffRole] ?? session.staffRole) : '운영진';

  async function logout() {
    const ok = await confirm({
      title: '로그아웃할까요?',
      message: '다시 들어올 때 로그인이 필요해요.',
      confirmText: '로그아웃',
      destructive: true,
    });
    if (!ok) return;
    try {
      await signOut();
      router.replace('/(auth)');
    } catch {
      toast('로그아웃하지 못했어요. 다시 시도해 주세요', 'error');
    }
  }

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: '현장',
      rows: [
        { dest: 'students', description: '이름·좌석으로 찾고 정보 확인' },
        { dest: 'seatMap', description: '지금 누가 어디 앉아 있는지' },
        { dest: 'phoneCheck', description: '휴대폰 제출·반납 체크' },
        {
          dest: 'patrol',
          description: '좌석 QR로 순찰 기록',
          value: ops?.patrol ? `진행 중 ${ops.patrol.checkedCount}/${ops.patrol.rosterCount}` : undefined,
          valueTone: 'brand',
        },
        {
          dest: 'handover',
          description: '근무 교대 전달 사항과 체크리스트',
          badge: ops?.handovers.unread,
        },
      ],
    },
    {
      title: '요청·승인',
      rows: [
        { dest: 'approvals', description: '쪽잠·네트워크·포인트·모의고사 신청', badge: badges.approvals },
        { dest: 'suggestions', description: '학생 건의 검토와 답변', badge: badges.suggestions },
        { dest: 'lunch', description: '오늘 수령 체크와 학부모 변경 요청', badge: badges.lunchRequests },
      ],
    },
    {
      title: '학습',
      rows: [
        { dest: 'tasks', description: '제출물 확인과 피드백' },
        { dest: 'vocab', description: '영단어 시험 현황' },
        { dest: 'parentReports', description: '학부모에게 보내는 리포트' },
      ],
    },
    {
      title: '소통',
      rows: [
        { dest: 'announcements', description: '멘토링 공지·월간 리포트 공지' },
        { dest: 'calendar', description: '학교 시험·행사와 근무 멘토' },
        { dest: 'broadcast', description: '학생·학부모·직원에게 푸시 알림' },
      ],
    },
    {
      title: '내 근무',
      rows: [
        {
          dest: 'work',
          description: ops ? `${ops.month.month}월 정산 · 최근 출퇴근 기록` : '출근·퇴근 기록과 이번 달 정산',
          value: ops ? (ops.clock.isWorking ? '근무 중' : '퇴근') : undefined,
          valueTone: ops?.clock.isWorking ? 'positive' : 'neutralSubtle',
        },
      ],
    },
    {
      title: '설정',
      rows: [
        { dest: 'notifications', description: '받을 알림 고르기' },
        { dest: 'account', description: '비밀번호 · 회원 탈퇴 · 고객센터' },
      ],
    },
  ];

  const visible = sections
    .map((sec) => ({ ...sec, rows: sec.rows.filter((r) => canOpen(caps, r.dest)) }))
    .filter((sec) => sec.rows.length > 0);

  const version = Constants.expoConfig?.version;

  return (
    <Screen kind="tab" title="전체" maxWidth={isTablet ? 640 : undefined}>
      <Stack>
        <Section>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x4 }}>
            <Avatar name={session?.displayName ?? '직원'} size={56} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="t7-bold" numberOfLines={1}>
                {session?.displayName ?? '직원'}
              </Text>
              <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1} style={{ marginTop: space.x0_5 }}>
                강한선배 {role}
              </Text>
            </View>
            {caps?.fullAccess ? <Badge tone="brand">관리자</Badge> : null}
          </View>
        </Section>

        {visible.map((sec) => (
          <Section key={sec.title} title={sec.title} flush>
            {sec.rows.map((r) => {
              const d = STAFF_DEST[r.dest];
              return (
                <ListRow
                  key={r.dest}
                  href={d.href}
                  leading={<IconTile icon={d.icon} tone={d.tone} />}
                  title={r.label ?? d.label}
                  description={r.description}
                  trailing={
                    (r.badge ?? 0) > 0 ? (
                      <CountBadge count={r.badge ?? 0} />
                    ) : r.value ? (
                      <Text variant="t4-medium" color={r.valueTone ?? 'neutralSubtle'} tabular>
                        {r.value}
                      </Text>
                    ) : undefined
                  }
                />
              );
            })}
          </Section>
        ))}

        <Section flush>
          <ListRow
            onPress={() => void logout()}
            chevron={false}
            leading={<IconTile icon={LogOut} tone="bad" />}
            title={
              <Text variant="t5-medium" color="critical">
                로그아웃
              </Text>
            }
          />
        </Section>

        {version ? (
          <Text variant="t2-regular" color="placeholder" align="center" style={{ paddingTop: space.x3 }}>
            강한선배 {version}
          </Text>
        ) : null}
      </Stack>
    </Screen>
  );
}
