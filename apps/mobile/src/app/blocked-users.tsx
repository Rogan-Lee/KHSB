import { Redirect } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  ListRow,
  Screen,
  Section,
  Skeleton,
  Stack,
  Text,
  space,
  useResponsive,
} from '@/design';
import { releaseBlock } from '@/features/safety/safety-menu';
import { SAFETY_BLOCKS_PATH, type BlockListResponse, type BlockedUser } from '@/lib/api/safety';
import { refreshBadges } from '@/lib/badges';
import { useMobileQuery } from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

const TYPE_LABEL = { STUDENT: '학생', STAFF: '선생님' } as const;

/** ISO → "10월 11일 차단" (KST) */
function blockedOn(iso: string) {
  const d = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 차단`;
}

/** 차단한 사용자 — 계정·보안에서 진입. 차단은 대화 화면(말풍선 길게 누르기 · ⋯)에서 하고, 여기서는 풀기만 한다. */
export default function BlockedUsersScreen() {
  const { status } = useSession();
  const { isTablet } = useResponsive();
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<BlockListResponse>(SAFETY_BLOCKS_PATH);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (status === 'anonymous') return <Redirect href="/(auth)" />;

  const unblock = async (block: BlockedUser) => {
    if (busyId) return;
    setBusyId(block.id);
    if (await releaseBlock(block.user)) {
      await refresh();
      refreshBadges();
    }
    setBusyId(null);
  };

  const blocks = data?.blocks ?? [];

  return (
    <Screen
      kind="push"
      title="차단한 사용자"
      backFallback="/account"
      maxWidth={isTablet ? 600 : undefined}
      refreshing={isRefreshing}
      onRefresh={() => void refresh()}>
      {isLoading && !data ? (
        <Section flush>
          {[0, 1].map((i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x3,
                paddingHorizontal: space.x5,
                paddingVertical: space.x3,
              }}>
              <Skeleton style={{ width: 40, height: 40, borderRadius: 20 }} />
              <Skeleton style={{ width: '40%', height: 20 }} />
            </View>
          ))}
        </Section>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : blocks.length === 0 ? (
        <Section>
          <EmptyState
            icon={ShieldCheck}
            title="차단한 사용자가 없어요"
            description={'대화에서 받은 메시지를 길게 누르거나\n오른쪽 위 ⋯ 를 누르면 신고·차단할 수 있어요.'}
          />
        </Section>
      ) : (
        <Stack>
          <Text variant="t4-regular" color="neutralSubtle" style={{ paddingHorizontal: space.x1 }}>
            차단한 사람의 글은 보이지 않고, 서로 새 메시지를 보낼 수 없어요.
          </Text>
          <Section flush>
            {blocks.map((block) => (
              <ListRow
                key={block.id}
                leading={<Avatar name={block.user.name} size={40} />}
                title={block.user.name}
                description={`${TYPE_LABEL[block.user.type]} · ${blockedOn(block.createdAt)}`}
                trailing={
                  <Button
                    variant="gray"
                    size="sm"
                    loading={busyId === block.id}
                    disabled={busyId != null && busyId !== block.id}
                    onPress={() => void unblock(block)}
                    accessibilityLabel={`${block.user.name}님 차단 해제`}>
                    차단 해제
                  </Button>
                }
              />
            ))}
          </Section>
        </Stack>
      )}
    </Screen>
  );
}
