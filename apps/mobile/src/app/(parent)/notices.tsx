import { Megaphone, Users } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import {
  color,
  EmptyState,
  ErrorState,
  GroupLabel,
  radius,
  Screen,
  Section,
  Skeleton,
  space,
  Stack,
} from '@/design';
import { useChildQuery } from '@/features/parent/child-query';
import { AdmissionCard, NoticePostCard } from '@/features/parent/notice-card';
import { parentServicePaths, type ParentNoticesResponse } from '@/lib/api/parent-services';
import { ChildChips, useParentChild } from '@/lib/parent-child';
import { useResponsive } from '@/lib/responsive';

/** 공지사항 — 이달의 입시 정보(자녀 학년) + 학부모 공지 + 운영 안내 */
export default function ParentNoticesScreen() {
  const { selected } = useParentChild();
  const { isTablet } = useResponsive();
  const childId = selected?.id ?? null;
  const q = useChildQuery<ParentNoticesResponse>(childId ? parentServicePaths.notices(childId) : null, childId);
  const data = q.data;

  let body;
  if (!selected || !childId) {
    body = <EmptyState icon={Users} title="연결된 자녀가 없어요" description="자녀를 먼저 연결해 주세요." />;
  } else if (!data || q.isLoading) {
    body = q.error ? <ErrorState message={q.error} onRetry={q.retry} /> : <NoticesSkeleton />;
  } else if (!data.admission && data.notices.length === 0) {
    body = (
      <Section>
        <EmptyState
          icon={Megaphone}
          title="아직 공지가 없어요"
          description="새 소식이 올라오면 여기에서 볼 수 있어요."
          style={{ paddingVertical: space.x8 }}
        />
      </Section>
    );
  } else {
    body = (
      <>
        {data.admission && <AdmissionCard admission={data.admission} />}
        {data.notices.length > 0 && (
          <View style={{ gap: space.x3 }}>
            {data.admission && <GroupLabel trailing={`${data.notices.length}건`}>공지</GroupLabel>}
            {data.notices.map((n, i) => (
              <NoticePostCard key={n.id} notice={n} initiallyOpen={i === 0} />
            ))}
          </View>
        )}
      </>
    );
  }

  return (
    <Screen
      kind="push"
      title="공지사항"
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

function NoticesSkeleton() {
  return (
    <Stack>
      {[0, 1, 2].map((i) => (
        <View key={i} style={s.skel}>
          <Skeleton style={{ width: 64, height: 20, borderRadius: radius.r1 }} />
          <Skeleton style={{ width: '65%', height: 22 }} />
          <Skeleton style={{ width: '100%', height: 18 }} />
          <Skeleton style={{ width: '90%', height: 18 }} />
          <Skeleton style={{ width: '55%', height: 18 }} />
        </View>
      ))}
    </Stack>
  );
}

const s = StyleSheet.create({
  skel: { backgroundColor: color.bg.layerDefault, borderRadius: radius.r5, padding: space.x5, gap: space.x2_5 },
});
