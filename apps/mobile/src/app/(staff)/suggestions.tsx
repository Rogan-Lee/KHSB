import { MessageSquarePlus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { TwoPane } from '@/components/two-pane';
import { Chip, ChipGroup, EmptyState, ErrorState, Screen, Section, Stack, Text } from '@/design';
import { SUGGESTION_STATUS, SUGGESTION_STATUS_ORDER } from '@/features/staff-inbox/status';
import {
  SuggestionDetail,
  SuggestionListSkeleton,
  SuggestionRow,
} from '@/features/staff-inbox/suggestions';
import { PaneScroll } from '@/features/staff-inbox/ui';
import {
  staffInboxPaths,
  type StaffSuggestionItem,
  type StaffSuggestionsResponse,
} from '@/lib/api/staff-inbox';
import { refreshBadges } from '@/lib/badges';
import { useMobileQuery, type SuggestionStatus } from '@/lib/mobile-api';
import { useResponsive } from '@/lib/responsive';

const ACTIONABLE: SuggestionStatus[] = ['RECEIVED', 'REVIEWING'];

const EMPTY_TEXT: Record<SuggestionStatus, string> = {
  RECEIVED: '새로 접수된 건의가 없어요',
  REVIEWING: '검토 중인 건의가 없어요',
  REFLECTED: '반영 완료한 건의가 없어요',
  DECLINED: '보류한 건의가 없어요',
};

/**
 * 학생 건의사항 관리 — 상태별 목록 · 상세에서 상태 변경과 답변.
 * 숨김·삭제는 웹에서 원장만 할 수 있어요.
 */
export default function StaffSuggestionsScreen() {
  const { isTablet } = useResponsive();
  const { data, error, isLoading, isRefreshing, refresh, retry } = useMobileQuery<StaffSuggestionsResponse>(
    staffInboxPaths.suggestions,
  );
  const [status, setStatus] = useState<SuggestionStatus>('RECEIVED');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 저장 직후 서버 응답으로 바로 반영 (목록 새로고침 전)
  const [saved, setSaved] = useState<Record<string, StaffSuggestionItem>>({});

  const items = useMemo(() => (data?.items ?? []).map((i) => saved[i.id] ?? i), [data, saved]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        SUGGESTION_STATUS_ORDER.map((st) => [st, items.filter((i) => i.status === st).length]),
      ) as Record<SuggestionStatus, number>,
    [items],
  );
  const visible = items.filter((i) => i.status === status);
  const selected = selectedId ? (items.find((i) => i.id === selectedId) ?? null) : null;

  const onSaved = (item: StaffSuggestionItem) => {
    setSaved((m) => ({ ...m, [item.id]: item }));
    refreshBadges();
    // 새로 받은 목록이 기준 — 덮어쓴 항목은 비운다
    void refresh().then(() => setSaved({}));
    if (!isTablet) setSelectedId(null);
  };

  const list = (
    <Stack>
      <ChipGroup>
        {SUGGESTION_STATUS_ORDER.map((st) => (
          <Chip key={st} selected={status === st} onPress={() => setStatus(st)}>
            {/* 건수는 처리할 게 남은 상태(접수·검토중)만 */}
            {counts[st] > 0 && ACTIONABLE.includes(st)
              ? `${SUGGESTION_STATUS[st].label} ${counts[st]}`
              : SUGGESTION_STATUS[st].label}
          </Chip>
        ))}
      </ChipGroup>

      {isLoading && !data ? (
        <SuggestionListSkeleton />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : visible.length === 0 ? (
        <Section>
          <EmptyState
            icon={MessageSquarePlus}
            title={EMPTY_TEXT[status]}
            description={status === 'RECEIVED' ? '학생이 건의를 올리면 여기에 먼저 보여요.' : undefined}
          />
        </Section>
      ) : (
        <Section flush>
          {visible.map((item) => (
            <SuggestionRow
              key={item.id}
              item={item}
              selected={isTablet && item.id === selectedId}
              onPress={() => setSelectedId(item.id)}
            />
          ))}
        </Section>
      )}

      <View style={{ paddingHorizontal: 4 }}>
        <Text variant="t3-regular" color="neutralSubtle">
          숨김·삭제는 웹 관리자 화면에서 원장님만 할 수 있어요.
        </Text>
      </View>
    </Stack>
  );

  if (isTablet) {
    return (
      <Screen kind="push" title="건의사항" backFallback="/(staff)/(tabs)" scroll={false} maxWidth={0}>
        <TwoPane
          master={
            <PaneScroll refreshing={isRefreshing} onRefresh={() => void refresh()}>
              {list}
            </PaneScroll>
          }
          detail={
            selected ? (
              <SuggestionDetail
                key={selected.id}
                item={selected}
                inline
                onClose={() => setSelectedId(null)}
                onSaved={onSaved}
              />
            ) : null
          }
          detailVisible={selected != null}
          onCloseDetail={() => setSelectedId(null)}
          emptyTitle="건의를 선택하세요"
          emptyMessage="왼쪽 목록에서 고르면 내용을 보고 답변할 수 있어요."
        />
      </Screen>
    );
  }

  return (
    <Screen
      kind="push"
      title="건의사항"
      backFallback="/(staff)/(tabs)"
      refreshing={isRefreshing}
      onRefresh={() => void refresh()}>
      {list}
      {selected ? (
        <SuggestionDetail
          key={selected.id}
          item={selected}
          onClose={() => setSelectedId(null)}
          onSaved={onSaved}
        />
      ) : null}
    </Screen>
  );
}
