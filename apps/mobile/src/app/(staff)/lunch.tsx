import { useLocalSearchParams } from 'expo-router';
import { Check, ChevronLeft, ChevronRight, MessageSquareText, Utensils } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  ListRow,
  Press,
  ProgressBar,
  Screen,
  Section,
  SegmentTabs,
  Stack,
  StatGrid,
  Text,
  TextField,
  color,
  radius,
  space,
  toast,
} from '@/design';
import { errorText, useOptimistic, usePullRefresh } from '@/features/staff-home/hooks';
import { formatDateKey, kstDateTime, kstTodayKey } from '@/features/staff-home/format';
import { ListSkeleton, SeatTile, StatSkeleton } from '@/features/staff-home/ui';
import {
  replyLunchRequest,
  setLunchReceived,
  STAFF_API,
  type LunchChangeRequestItem,
  type LunchPickupItem,
  type StaffLunchResponse,
} from '@/lib/api/staff-home';
import { refreshBadges } from '@/lib/badges';
import { useMobileQuery } from '@/lib/mobile-api';
import { useResponsive } from '@/lib/responsive';

type Tab = 'pickup' | 'requests';
type PickupFilter = 'all' | 'waiting' | 'done';

/** 점심 도시락 — 날짜별 수령 체크(큰 토글) + 학부모 변경 요청 답변 */
export default function StaffLunchScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const { isTablet } = useResponsive();
  const [date, setDate] = useState(() => kstTodayKey());
  const [tab, setTab] = useState<Tab>(params.tab === 'requests' ? 'requests' : 'pickup');
  const [filter, setFilter] = useState<PickupFilter>('all');
  const [replying, setReplying] = useState<LunchChangeRequestItem | null>(null);
  const { data, error, refresh, retry } = useMobileQuery<StaffLunchResponse>(STAFF_API.lunch(date));
  const { refreshing, onRefresh } = usePullRefresh(refresh);
  const [over, setOver] = useOptimistic<boolean>(data);
  const current = data && data.date === date ? data : null;

  const received = (it: LunchPickupItem) => over[it.id] ?? it.received;

  async function toggle(it: LunchPickupItem) {
    const next = !received(it);
    setOver(it.id, next);
    try {
      await setLunchReceived(it.id, next);
      void refresh();
    } catch (e) {
      setOver(it.id, undefined);
      toast(errorText(e, '수령 체크를 저장하지 못했어요'), 'error');
    }
  }

  const items = current?.items ?? [];
  const gotCount = items.filter(received).length;
  const shown = items.filter((it) =>
    filter === 'waiting' ? !received(it) : filter === 'done' ? received(it) : true
  );

  return (
    <Screen
      kind="push"
      title="점심 도시락"
      backFallback="/(staff)/(tabs)/menu"
      maxWidth={isTablet ? 720 : undefined}
      refreshing={refreshing}
      onRefresh={onRefresh}>
      <Stack>
        <SegmentTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'pickup', label: '수령 체크' },
            { value: 'requests', label: '변경 요청', count: current?.openRequests ?? data?.openRequests },
          ]}
        />

        {tab === 'pickup' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x1 }}>
            <Button
              size="sm"
              variant="ghost"
              icon={ChevronLeft}
              accessibilityLabel="이전 도시락 날짜"
              disabled={!current?.prevDate}
              onPress={() => current?.prevDate && setDate(current.prevDate)}
            />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="t6-bold" tabular>
                {formatDateKey(date)}
              </Text>
              {date === kstTodayKey() ? (
                <Text variant="t3-medium" color="brand">
                  오늘
                </Text>
              ) : (
                <Press onPress={() => setDate(kstTodayKey())} scale={0} hitSlop={8} accessibilityLabel="오늘로 이동">
                  <Text variant="t3-medium" color="neutralSubtle">
                    오늘로 가기
                  </Text>
                </Press>
              )}
            </View>
            <Button
              size="sm"
              variant="ghost"
              icon={ChevronRight}
              accessibilityLabel="다음 도시락 날짜"
              disabled={!current?.nextDate}
              onPress={() => current?.nextDate && setDate(current.nextDate)}
            />
          </View>
        )}

        {!current ? (
          error ? (
            <ErrorState message={error} onRetry={() => void retry()} />
          ) : (
            <Stack>
              <StatSkeleton />
              <ListSkeleton rows={4} title={false} />
            </Stack>
          )
        ) : tab === 'pickup' ? (
          !current.menu ? (
            <Section>
              <EmptyState
                icon={Utensils}
                title="이날은 도시락 메뉴가 없어요"
                description="화살표로 도시락이 있는 날짜로 이동할 수 있어요"
              />
            </Section>
          ) : (
            <>
              <Section
                title={current.menu.name}
                description={`${current.menu.price.toLocaleString('ko-KR')}원${current.menu.closed ? ' · 신청 마감' : ''}`}>
                <Stack gap={space.x3}>
                  <StatGrid
                    items={[
                      { label: '신청', value: current.summary.total },
                      { label: '수령', value: gotCount, tone: 'positive' },
                      { label: '남음', value: current.summary.total - gotCount, tone: current.summary.total - gotCount > 0 ? 'brand' : 'neutral' },
                      { label: '미입금', value: current.summary.unpaid, tone: current.summary.unpaid > 0 ? 'warning' : 'neutral' },
                    ]}
                  />
                  <ProgressBar value={current.summary.total ? gotCount / current.summary.total : 0} tone="ok" />
                </Stack>
              </Section>

              {items.length === 0 ? (
                <Section>
                  <EmptyState icon={Utensils} title="이날 신청한 학생이 없어요" />
                </Section>
              ) : (
                <>
                  <ChipGroup>
                    <Chip size="sm" selected={filter === 'all'} onPress={() => setFilter('all')}>
                      {`전체 ${items.length}`}
                    </Chip>
                    <Chip size="sm" selected={filter === 'waiting'} onPress={() => setFilter('waiting')}>
                      {`안 받음 ${items.length - gotCount}`}
                    </Chip>
                    <Chip size="sm" selected={filter === 'done'} onPress={() => setFilter('done')}>
                      {`받음 ${gotCount}`}
                    </Chip>
                  </ChipGroup>
                  <Section flush>
                    {shown.length === 0 ? (
                      <EmptyState
                        icon={Check}
                        title={filter === 'waiting' ? '모두 받아 갔어요' : '아직 받아 간 학생이 없어요'}
                      />
                    ) : (
                      shown.map((it) => (
                        <PickupRow key={it.id} item={it} received={received(it)} onToggle={() => void toggle(it)} />
                      ))
                    )}
                  </Section>
                </>
              )}
            </>
          )
        ) : current.requests.length === 0 ? (
          <Section>
            <EmptyState icon={MessageSquareText} title="변경 요청이 없어요" description="학부모가 요청을 보내면 여기에 모여요" />
          </Section>
        ) : (
          <Section flush>
            {current.requests.map((r) => (
              <ListRow
                key={r.id}
                align="start"
                onPress={() => setReplying(r)}
                meta={
                  r.reply ? <Badge tone="ok">반영 완료</Badge> : <Badge tone="bad">미처리</Badge>
                }
                title={`${r.studentName} · ${r.grade}`}
                description={
                  <View style={{ gap: space.x1 }}>
                    <Text variant="t4-regular" color="neutralMuted" numberOfLines={3}>
                      {r.message}
                    </Text>
                    <Text variant="t3-regular" color="neutralSubtle" tabular>
                      {kstDateTime(r.createdAt)}
                    </Text>
                  </View>
                }
              />
            ))}
          </Section>
        )}
      </Stack>

      {replying && (
        <ReplySheet
          key={replying.id}
          request={replying}
          onClose={() => setReplying(null)}
          onSaved={async () => {
            setReplying(null);
            refreshBadges();
            await refresh();
          }}
        />
      )}
    </Screen>
  );
}

function PickupRow({
  item,
  received,
  onToggle,
}: {
  item: LunchPickupItem;
  received: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3, paddingHorizontal: space.x5, paddingVertical: space.x2_5 }}>
      <SeatTile seat={item.seat} tone={received ? 'ok' : 'gray'} />
      <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
        <Text variant="t5-medium" numberOfLines={1} color={received ? 'neutralSubtle' : 'neutral'}>
          {item.studentName}
          <Text variant="t4-regular" color="neutralSubtle">{`  ${item.grade}`}</Text>
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x1, alignItems: 'center' }}>
          {item.paid ? (
            <Badge tone="ok">입금 완료</Badge>
          ) : item.depositClaimed ? (
            <Badge tone="info">입금 확인 필요</Badge>
          ) : (
            <Badge tone="warn">미입금</Badge>
          )}
          {item.memo ? (
            <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1} style={{ flexShrink: 1 }}>
              {item.memo}
            </Text>
          ) : null}
        </View>
      </View>
      <Press
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: received }}
        accessibilityLabel={`${item.studentName} 도시락 ${received ? '받음' : '안 받음'}`}
        pressedBg={received ? color.bg.positiveSolidPressed : color.bg.neutralWeakPressed}
        style={{
          minWidth: 84,
          height: 44,
          borderRadius: radius.full,
          paddingHorizontal: space.x4,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.x1,
          backgroundColor: received ? color.bg.positiveSolid : color.bg.neutralWeak,
        }}>
        {received && <Check color={color.palette.staticWhite} size={18} strokeWidth={2.6} />}
        <Text variant="t4-bold" color={received ? 'staticWhite' : 'neutral'}>
          {received ? '받음' : '수령'}
        </Text>
      </Press>
    </View>
  );
}

function ReplySheet({
  request,
  onClose,
  onSaved,
}: {
  request: LunchChangeRequestItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [reply, setReply] = useState(request.reply ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    if (!reply.trim()) {
      toast('반영 내용을 적어 주세요', 'error');
      return;
    }
    setSaving(true);
    try {
      await replyLunchRequest(request.id, reply.trim());
      toast('반영 답변을 보냈어요. 학부모가 확인할 수 있어요', 'success');
      await onSaved();
    } catch (e) {
      toast(errorText(e, '답변을 저장하지 못했어요'), 'error');
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      dismissible={!saving}
      title={`${request.studentName} 학부모 요청`}
      description={kstDateTime(request.createdAt)}
      footer={
        <>
          <View style={{ flex: 1 }}>
            <Button variant="gray" block onPress={onClose} disabled={saving}>
              닫기
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button block loading={saving} disabled={!reply.trim()} onPress={() => void save()}>
              {request.reply ? '답변 고치기' : '답변 보내기'}
            </Button>
          </View>
        </>
      }>
      <View style={{ backgroundColor: color.bg.layerFill, borderRadius: radius.r3, padding: space.x4 }}>
        <Text variant="t4-regular" selectable>
          {request.message}
        </Text>
      </View>
      {request.reply && request.repliedAt ? (
        <Text variant="t3-regular" color="neutralSubtle">
          {`${request.repliedByName ?? '운영진'} · ${kstDateTime(request.repliedAt)}에 답했어요`}
        </Text>
      ) : null}
      <TextField
        label="반영 내용"
        value={reply}
        onChangeText={setReply}
        multiline
        minHeight={110}
        maxLength={1000}
        showCount
        placeholder="어떻게 반영했는지 학부모에게 안내해 주세요"
      />
    </BottomSheet>
  );
}
