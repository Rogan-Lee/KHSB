import Constants from 'expo-constants';
import { Redirect, router, type Href } from 'expo-router';
import { Bell, FileText, Headset, KeyRound, LogOut, Mail, Phone, UserX, Users } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { PasswordChangeSheet, useDeleteAccount } from '@/components/account-security';
import {
  Avatar,
  Badge,
  EmptyState,
  IconTile,
  InfoRow,
  ListRow,
  Screen,
  Section,
  Skeleton,
  Stack,
  Text,
  color,
  confirm,
  radius,
  space,
  useResponsive,
} from '@/design';
import { accountRoleLabel, accountRoleTone } from '@/lib/api/auth';
import { authClient } from '@/lib/auth-client';
import { useSession } from '@/lib/session';
import {
  PRIVACY_URL,
  SUPPORT_EMAIL,
  SUPPORT_TEL,
  SUPPORT_URL,
  callSupport,
  emailSupport,
  openHelpPage,
} from '@/lib/support';

/** 태블릿에서 설정 목록 폭 — 라벨과 값이 멀어지지 않게 기본(720)보다 좁게 가운데 */
const SETTINGS_TABLET_WIDTH = 600;

/**
 * 계정·보안 — 모든 역할 공통 (학생·직원·학부모 전체 메뉴에서 /account 로 연결).
 * 프로필 요약 · 로그인 정보 · 연결된 자녀(학부모) · 알림 설정 · 비밀번호 변경 · 도움말(고객센터·전화·이메일·개인정보처리방침) · 로그아웃 · 계정 삭제
 */
export default function AccountScreen() {
  const { session, status, signOut } = useSession();
  const { isTablet } = useResponsive();
  const authSession = authClient.useSession();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // 로그아웃·삭제 뒤: 루트 스택을 비우고 로그인 화면 하나만 남긴다 (뒤로 가기로 역할 화면에 돌아가지 않게)
  const leave = async () => {
    setLeaving(true);
    try {
      await signOut();
    } catch {
      // 서버 로그아웃이 실패해도 화면은 정리한다
    }
    if (router.canDismiss()) router.dismissAll();
    router.replace('/(auth)');
  };
  const del = useDeleteAccount({ signOut: leave });

  if (status === 'anonymous' && !leaving) return <Redirect href="/(auth)" />;

  const logout = async () => {
    if (leaving) return;
    const ok = await confirm({
      title: '로그아웃할까요?',
      message: '다시 로그인하면 이어서 쓸 수 있어요.',
      confirmText: '로그아웃',
    });
    if (ok) await leave();
  };

  const user = authSession.data?.user as
    | { username?: string | null; displayUsername?: string | null; email?: string | null }
    | undefined;
  const username = user?.displayUsername || user?.username || null;
  const email = user?.email || null;
  const version = Constants.expoConfig?.version;

  return (
    <Screen
      kind="push"
      title="계정"
      backFallback="/"
      maxWidth={isTablet ? SETTINGS_TABLET_WIDTH : undefined}>
      {!session ? (
        <AccountSkeleton />
      ) : (
        <Stack>
          <Section>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x4 }}>
              <Avatar name={session.displayName} size={56} />
              <View style={{ flex: 1, minWidth: 0, gap: space.x1_5 }}>
                <Text variant="t7-bold" numberOfLines={1}>
                  {session.displayName}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.x1_5 }}>
                  <Badge tone={accountRoleTone(session)} size="md">
                    {accountRoleLabel(session)}
                  </Badge>
                  {username != null && (
                    <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1} style={{ flexShrink: 1 }}>
                      @{username}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </Section>

          <Section title="로그인 정보">
            <InfoRow label="아이디">{username ?? '설정 안 됨'}</InfoRow>
            <InfoRow label="이메일">
              <Text variant="t5-medium" align="right" numberOfLines={1} style={{ flexShrink: 1 }}>
                {email ?? '없음'}
              </Text>
            </InfoRow>
          </Section>

          {session.role === 'parent' && (
            <Section
              title="연결된 자녀"
              description="자녀를 추가하거나 바꾸려면 독서실에 문의해 주세요."
              flush>
              {session.children && session.children.length > 0 ? (
                session.children.map((child) => (
                  <ListRow
                    key={child.id}
                    leading={<Avatar name={child.name} size={40} />}
                    title={child.name}
                    description={[child.grade, child.seat ? `좌석 ${child.seat}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                ))
              ) : (
                <EmptyState
                  icon={Users}
                  title="연결된 자녀가 없어요"
                  description="독서실에서 자녀 연결 초대를 다시 받아 주세요."
                  style={{ paddingVertical: space.x8 }}
                />
              )}
            </Section>
          )}

          <Section flush>
            <ListRow
              leading={<IconTile icon={Bell} size={40} />}
              title="알림 설정"
              description="받을 알림 종류를 고를 수 있어요"
              href={'/notifications' as Href}
            />
            <ListRow
              leading={<IconTile icon={KeyRound} size={40} />}
              title="비밀번호 변경"
              onPress={() => setPasswordOpen(true)}
            />
          </Section>

          <Section title="도움말" flush>
            <ListRow
              leading={<IconTile icon={Headset} size={40} />}
              title="고객센터"
              description="자주 묻는 질문과 문의 방법"
              onPress={() => void openHelpPage(SUPPORT_URL)}
            />
            <ListRow
              leading={<IconTile icon={Phone} size={40} />}
              title="전화 문의"
              trailing={SUPPORT_TEL}
              onPress={() => void callSupport()}
            />
            <ListRow
              leading={<IconTile icon={Mail} size={40} />}
              title="이메일 문의"
              trailing={SUPPORT_EMAIL}
              onPress={() => void emailSupport()}
            />
            <ListRow
              leading={<IconTile icon={FileText} size={40} />}
              title="개인정보처리방침"
              onPress={() => void openHelpPage(PRIVACY_URL)}
            />
          </Section>

          <Section flush>
            <ListRow
              leading={<IconTile icon={LogOut} size={40} />}
              title="로그아웃"
              chevron={false}
              trailing={leaving ? <ActivityIndicator color={color.fg.neutralSubtle} /> : undefined}
              onPress={() => void logout()}
            />
            <ListRow
              leading={<IconTile icon={UserX} tone="bad" size={40} />}
              title={
                <Text variant="t5-medium" color="critical">
                  계정 삭제
                </Text>
              }
              description="회원 탈퇴 · 로그인 계정을 지우고 모든 기기에서 로그아웃해요"
              chevron={false}
              onPress={leaving ? undefined : del.start}
            />
          </Section>

          {version != null && (
            <Text variant="t3-regular" color="neutralSubtle" align="center" style={{ marginTop: space.x2 }}>
              강한선배 {version}
            </Text>
          )}
        </Stack>
      )}
      <PasswordChangeSheet open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      {del.sheet}
    </Screen>
  );
}

function AccountSkeleton() {
  return (
    <Stack>
      <Section>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x4 }}>
          <Skeleton style={{ width: 56, height: 56, borderRadius: radius.full }} />
          <View style={{ flex: 1, gap: space.x2 }}>
            <Skeleton style={{ width: '45%', height: 22 }} />
            <Skeleton style={{ width: '30%', height: 18 }} />
          </View>
        </View>
      </Section>
      <Section>
        <View style={{ gap: space.x3 }}>
          <Skeleton style={{ width: '70%', height: 18 }} />
          <Skeleton style={{ width: '60%', height: 18 }} />
          <Skeleton style={{ width: '50%', height: 18 }} />
        </View>
      </Section>
      <Skeleton style={{ height: 136, borderRadius: radius.r5 }} />
    </Stack>
  );
}
