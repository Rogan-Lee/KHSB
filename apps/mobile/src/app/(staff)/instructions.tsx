import { ClipboardPen, Inbox } from 'lucide-react-native';
import { Fragment, useState } from 'react';

import { TwoPane } from '@/components/two-pane';
import { Chip, ChipGroup, Divider, EmptyState, ErrorState, Screen, Section, Stack, space } from '@/design';
import { SuggestionListSkeleton } from '@/features/staff-inbox/suggestions';
import { PaneScroll } from '@/features/staff-inbox/ui';
import { InstructionItem, PendingRequestRow, RequestDetail } from '@/features/staff-instructions/ui';
import { STAFF_INSTRUCTIONS_PATH, type InstructionInboxResponse } from '@/lib/api/instructions';
import { refreshBadges } from '@/lib/badges';
import { useMobileQuery } from '@/lib/mobile-api';
import { useResponsive } from '@/lib/responsive';

type Tab = 'pending' | 'sent';

/**
 * 학생 지시 — 학부모 요청마다 AI 초안을 고쳐 학생에게 보내거나 확인만 한다. 보낸 지시와 학생 확인도 여기서.
 * 학생은 학부모 요청이라는 걸 모른다 (서버가 원문을 학생에게 주지 않음).
 */
export default function StaffInstructionsScreen() {
  const { isTablet } = useResponsive();
  const { data, error, isLoading, isRefreshing, refresh, retry } = useMobileQuery<InstructionInboxResponse>(
    STAFF_INSTRUCTIONS_PATH,
  );
  const [tab, setTab] = useState<Tab>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pending = data?.pending ?? [];
  const sent = data?.sent ?? [];
  const selected = selectedId ? (pending.find((i) => i.id === selectedId) ?? null) : null;

  const reload = () => {
    refreshBadges();
    void refresh();
  };
  // 보냈거나 확인만 — 요청이 목록에서 빠지므로 상세도 닫는다
  const onDone = () => {
    setSelectedId(null);
    reload();
  };

  const list = (
    <Stack>
      <ChipGroup>
        <Chip selected={tab === 'pending'} onPress={() => setTab('pending')}>
          {pending.length > 0 ? `처리할 요청 ${pending.length}` : '처리할 요청'}
        </Chip>
        <Chip selected={tab === 'sent'} onPress={() => setTab('sent')}>
          보낸 지시
        </Chip>
      </ChipGroup>

      {isLoading && !data ? (
        <SuggestionListSkeleton />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <Section>
            <EmptyState
              icon={Inbox}
              title="처리할 학부모 요청이 없어요"
              description="학부모님이 요청을 남기면 AI 초안과 함께 여기에 보여요."
            />
          </Section>
        ) : (
          <Section flush>
            {pending.map((item) => (
              <PendingRequestRow
                key={item.id}
                item={item}
                selected={isTablet && item.id === selectedId}
                onPress={() => setSelectedId(item.id)}
              />
            ))}
          </Section>
        )
      ) : sent.length === 0 ? (
        <Section>
          <EmptyState icon={ClipboardPen} title="보낸 지시가 없어요" />
        </Section>
      ) : (
        <Section>
          <Stack gap={space.x4}>
            {sent.map((item, i) => (
              <Fragment key={item.id}>
                {i > 0 ? <Divider /> : null}
                <InstructionItem item={item} showStudent />
              </Fragment>
            ))}
          </Stack>
        </Section>
      )}
    </Stack>
  );

  if (isTablet) {
    return (
      <Screen kind="push" title="학생 지시" backFallback="/(staff)/(tabs)" scroll={false} maxWidth={0}>
        <TwoPane
          master={
            <PaneScroll refreshing={isRefreshing} onRefresh={reload}>
              {list}
            </PaneScroll>
          }
          detail={
            selected ? (
              <RequestDetail
                key={selected.id}
                item={selected}
                inline
                onClose={() => setSelectedId(null)}
                onDone={onDone}
                onChanged={reload}
              />
            ) : null
          }
          detailVisible={selected != null}
          onCloseDetail={() => setSelectedId(null)}
          emptyTitle="학부모 요청을 선택하세요"
          emptyMessage="왼쪽에서 고르면 AI 초안을 고쳐 학생에게 보낼 수 있어요."
        />
      </Screen>
    );
  }

  return (
    <Screen kind="push" title="학생 지시" backFallback="/(staff)/(tabs)" refreshing={isRefreshing} onRefresh={reload}>
      {list}
      {selected ? (
        <RequestDetail
          key={selected.id}
          item={selected}
          onClose={() => setSelectedId(null)}
          onDone={onDone}
          onChanged={reload}
        />
      ) : null}
    </Screen>
  );
}
