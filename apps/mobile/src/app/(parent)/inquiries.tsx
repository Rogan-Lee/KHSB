import { Inbox, Phone, Users } from 'lucide-react-native';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  color,
  Divider,
  EmptyState,
  ErrorState,
  Notice,
  radius,
  Screen,
  Section,
  Skeleton,
  space,
  Stack,
  Text,
} from '@/design';
import { useChildQuery } from '@/features/parent/child-query';
import { InquiryCompose } from '@/features/parent/inquiry-compose';
import { InquiryItem } from '@/features/parent/inquiry-item';
import { parentServicePaths, type ParentInquiriesResponse } from '@/lib/api/parent-services';
import { refreshBadges } from '@/lib/badges';
import { ChildChips, useParentChild } from '@/lib/parent-child';
import { useResponsive } from '@/lib/responsive';

/**
 * 원장님께 문의 — 종류(상담 요청·출결·학습·기타)를 골라 남기면 운영진의 학생별 소통 기록에 쌓이고
 * Slack 으로 알림이 간다. 아래에서 내가 보낸 문의와 확인 여부를 본다.
 */
export default function ParentInquiriesScreen() {
  const { selected } = useParentChild();
  const { isTablet } = useResponsive();
  const childId = selected?.id ?? null;
  const q = useChildQuery<ParentInquiriesResponse>(childId ? parentServicePaths.inquiries(childId) : null, childId);
  const data = q.data;

  let body;
  if (!selected || !childId) {
    body = <EmptyState icon={Users} title="연결된 자녀가 없어요" description="자녀를 먼저 연결해 주세요." />;
  } else {
    body = (
      <>
        <InquiryCompose
          // 자녀를 바꾸면 쓰던 글을 비운다 (다른 자녀 앞으로 잘못 보내지 않게)
          key={childId}
          studentId={childId}
          studentName={selected.name}
          onSent={() => {
            refreshBadges();
            void q.refresh();
          }}
        />
        <Notice tone="gray" icon={Phone}>
          급한 연락(당일 결석·조퇴 등)은 독서실로 바로 전화해 주세요.
        </Notice>
        {!data || q.isLoading ? (
          q.error ? (
            <ErrorState message={q.error} onRetry={q.retry} />
          ) : (
            <ListSkeleton />
          )
        ) : (
          <Section
            flush
            title={
              <Text variant="t6-bold">
                보낸 문의{' '}
                {data.items.length > 0 && (
                  <Text variant="t6-bold" color="neutralSubtle" tabular>
                    {data.items.length}
                  </Text>
                )}
              </Text>
            }>
            {data.items.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="아직 보낸 문의가 없어요"
                description="남긴 문의는 여기에서 확인 여부를 볼 수 있어요."
                style={{ paddingVertical: space.x8 }}
              />
            ) : (
              data.items.map((item, i) => (
                <Fragment key={item.id}>
                  {i > 0 && <Divider inset={space.x5} />}
                  <InquiryItem item={item} />
                </Fragment>
              ))
            )}
          </Section>
        )}
      </>
    );
  }

  return (
    <Screen
      kind="push"
      title="원장님께 문의"
      backFallback="/(parent)/(tabs)/menu"
      refreshing={q.isRefreshing}
      onRefresh={childId ? () => void q.refresh() : undefined}
      maxWidth={isTablet ? 640 : undefined}>
      <Stack>
        <ChildChips />
        {body}
      </Stack>
    </Screen>
  );
}

function ListSkeleton() {
  return (
    <View style={s.skel}>
      <Skeleton style={{ width: 96, height: 22 }} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ gap: space.x2 }}>
          <View style={{ flexDirection: 'row', gap: space.x1_5 }}>
            <Skeleton style={{ width: 52, height: 20, borderRadius: radius.r1 }} />
            <Skeleton style={{ width: 52, height: 20, borderRadius: radius.r1 }} />
          </View>
          <Skeleton style={{ width: '95%', height: 18 }} />
          <Skeleton style={{ width: '60%', height: 18 }} />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  skel: { backgroundColor: color.bg.layerDefault, borderRadius: radius.r5, padding: space.x5, gap: space.x5 },
});
