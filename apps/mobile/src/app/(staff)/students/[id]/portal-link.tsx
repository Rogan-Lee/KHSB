import { useLocalSearchParams } from 'expo-router';
import { Copy, Link2, MessageSquare, RefreshCw, Send, UserX } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  Avatar,
  Badge,
  Button,
  color,
  confirm,
  EmptyState,
  ErrorState,
  IconTile,
  InfoRow,
  ListRow,
  Notice,
  radius,
  Screen,
  Section,
  space,
  Stack,
  Text,
  toast,
} from '@/design';
import { daysFromToday, formatDate, formatDateTime } from '@/features/staff-learning/format';
import { copyLink, formatPhone, openSms, shareMessage } from '@/features/staff-learning/share';
import { DetailSkeleton } from '@/features/staff-learning/skeletons';
import {
  issuePortalLink,
  portalLinkPath,
  type StaffPortalLinkResponse,
} from '@/lib/api/staff-learning';
import { useMobileQuery } from '@/lib/mobile-api';
import { useResponsive } from '@/lib/responsive';

/** 학생 포털 링크 보내기 — 현재 링크 상태, 발급·재발급, 공유·문자 */
export default function StaffPortalLinkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const studentId = String(id);
  const q = useMobileQuery<StaffPortalLinkResponse>(portalLinkPath(studentId));
  const [busy, setBusy] = useState<'issue' | 'reissue' | null>(null);
  const lock = useRef(false);
  const { isTablet } = useResponsive();
  const data = q.data && q.data.student.id === studentId ? q.data : null;

  async function issue(reissue: boolean) {
    if (lock.current || !data) return;
    if (reissue) {
      const ok = await confirm({
        title: '링크를 다시 만들까요?',
        message: '지금 링크는 바로 끊겨서 더 이상 열리지 않아요. 새 링크를 학생에게 다시 보내 주세요.',
        confirmText: '다시 만들기',
        destructive: true,
      });
      if (!ok) return;
    }
    lock.current = true;
    setBusy(reissue ? 'reissue' : 'issue');
    try {
      const result = await issuePortalLink(studentId, reissue);
      toast(result.reused ? '이미 쓰는 링크가 있어요' : '새 링크를 만들었어요', 'success');
      await q.refresh();
      await shareMessage(result.shareText, `${data.student.name} 학생 포털`);
    } catch (e) {
      toast(e instanceof Error ? e.message : '링크를 만들지 못했어요', 'error');
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <Screen kind="push" title="학생 포털 링크" maxWidth={isTablet ? 640 : undefined}>
        {q.error && !q.isLoading ? (
          <ErrorState message={q.error} onRetry={() => void q.retry()} />
        ) : (
          <DetailSkeleton fields={1} />
        )}
      </Screen>
    );
  }

  const { student, link } = data;
  const daysLeft = link ? daysFromToday(link.expiresAt) : null;
  const meta = [student.grade, student.school].filter(Boolean).join(' · ');

  return (
    <Screen
      kind="push"
      title="학생 포털 링크"
      maxWidth={isTablet ? 640 : undefined}
      refreshing={q.isRefreshing}
      onRefresh={() => void q.refresh()}
      footer={
        !student.active ? undefined : link ? (
          <Button
            variant="primary"
            size="lg"
            block
            icon={Send}
            onPress={() => void shareMessage(link.shareText, `${student.name} 학생 포털`)}>
            링크 보내기
          </Button>
        ) : (
          <Button variant="primary" size="lg" block icon={Link2} loading={busy === 'issue'} onPress={() => void issue(false)}>
            링크 만들기
          </Button>
        )
      }>
      <Stack>
        <Section>
          <View style={s.head}>
            <Avatar name={student.name} size={48} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="t7-bold" numberOfLines={1}>
                {student.name}
              </Text>
              {meta ? (
                <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1}>
                  {meta}
                </Text>
              ) : null}
            </View>
            {link ? (
              <Badge tone="ok" size="md">
                사용 중
              </Badge>
            ) : (
              <Badge tone="gray" size="md">
                링크 없음
              </Badge>
            )}
          </View>
        </Section>

        {!student.active ? (
          <Notice tone="bad" icon={UserX}>
            재원 중인 학생이 아니라 링크를 보낼 수 없어요.
          </Notice>
        ) : null}

        {link ? (
          <>
            <Section title="지금 쓰는 링크" description="학생이 로그인 없이 포털을 열 수 있는 링크예요">
              <Text variant="t4-regular" color="neutralMuted" selectable numberOfLines={2} style={s.urlBox}>
                {link.url}
              </Text>
              <View style={{ marginTop: space.x3 }}>
                <InfoRow label="쓸 수 있는 기간">
                  <View style={s.inline}>
                    <Text variant="t5-medium" tabular>
                      {`${formatDate(link.expiresAt)}까지`}
                    </Text>
                    {daysLeft != null ? (
                      <Badge tone={daysLeft <= 3 ? 'warn' : 'gray'}>
                        {daysLeft <= 0 ? '오늘까지' : `D-${daysLeft}`}
                      </Badge>
                    ) : null}
                  </View>
                </InfoRow>
                <InfoRow label="만든 날">{formatDate(link.issuedAt)}</InfoRow>
                <InfoRow label="최근 접속">
                  {link.lastAccessedAt ? (
                    <Text variant="t5-medium" tabular align="right">
                      {`${formatDateTime(link.lastAccessedAt)} · ${link.accessCount}회`}
                    </Text>
                  ) : (
                    <Text variant="t5-regular" color="neutralSubtle">
                      아직 열어보지 않았어요
                    </Text>
                  )}
                </InfoRow>
              </View>
            </Section>

            <Section flush title="보내기">
              <ListRow
                leading={<IconTile icon={Copy} size={40} />}
                title={Platform.OS === 'web' ? '링크 복사' : '링크만 보내기'}
                description={Platform.OS === 'web' ? '붙여 넣어 어디든 보낼 수 있어요' : '안내 문구 없이 주소만 보내요'}
                onPress={() => void copyLink(link.url)}
              />
              {student.parentPhone ? (
                <ListRow
                  leading={<IconTile icon={MessageSquare} tone="ok" size={40} />}
                  title="학부모님께 문자"
                  description={formatPhone(student.parentPhone)}
                  onPress={() => void openSms(student.parentPhone!, link.shareText)}
                />
              ) : null}
              {student.phone ? (
                <ListRow
                  leading={<IconTile icon={MessageSquare} tone="info" size={40} />}
                  title="학생에게 문자"
                  description={formatPhone(student.phone)}
                  onPress={() => void openSms(student.phone!, link.shareText)}
                />
              ) : null}
            </Section>

            {student.active ? (
              <Section
                title="링크를 잃어버렸나요?"
                description="다시 만들면 지금 링크는 바로 끊기고 새 링크가 만들어져요.">
                <Button
                  variant="gray"
                  size="md"
                  block
                  icon={RefreshCw}
                  loading={busy === 'reissue'}
                  onPress={() => void issue(true)}>
                  링크 다시 만들기
                </Button>
              </Section>
            ) : null}
          </>
        ) : (
          <Section>
            <EmptyState
              icon={Link2}
              title="아직 쓰는 링크가 없어요"
              description="링크를 만들면 학생이 로그인 없이 과제·질문·일정을 볼 수 있어요. 30일 동안 열려요."
              style={{ paddingVertical: space.x8 }}
            />
          </Section>
        )}
      </Stack>
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  urlBox: {
    backgroundColor: color.bg.layerFill,
    borderRadius: radius.r3,
    paddingHorizontal: space.x3_5,
    paddingVertical: space.x3,
    overflow: 'hidden',
  },
});
