import { ClipboardList, Eye, Pin, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  Badge,
  BottomSheet,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  GroupLabel,
  HeaderIconButton,
  Screen,
  Section,
  SegmentTabs,
  Segmented,
  Stack,
  Text,
  TextField,
  color,
  radius,
  space,
  toast,
} from '@/design';
import { errorText, useOptimistic, usePullRefresh } from '@/features/staff-home/hooks';
import { formatDateKey, kstDateTime, kstTodayKey } from '@/features/staff-home/format';
import { CheckRow, ListSkeleton } from '@/features/staff-home/ui';
import {
  confirmHandover,
  createHandover,
  STAFF_API,
  toggleHandoverItem,
  type HandoverItem,
  type StaffHandoversListResponse,
} from '@/lib/api/staff-home';
import { refreshBadges } from '@/lib/badges';
import { useMobileQuery } from '@/lib/mobile-api';
import { useResponsive } from '@/lib/responsive';
import { useSession } from '@/lib/session';

/** 인수인계 — 최근 2주 목록 · 확인 · 할 일/체크리스트 체크 · 새로 쓰기 */
export default function StaffHandoverScreen() {
  const { session } = useSession();
  const { isTablet } = useResponsive();
  const { data, error, isLoading, refresh, retry } = useMobileQuery<StaffHandoversListResponse>(
    STAFF_API.handovers
  );
  const { refreshing, onRefresh } = usePullRefresh(refresh);
  const [tab, setTab] = useState<'all' | 'unread' | 'urgent'>('all');
  const [creating, setCreating] = useState(false);
  const [itemOver, setItemOver] = useOptimistic<boolean>(data);
  const [readOver, setReadOver] = useOptimistic<boolean>(data);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const me = session?.domainId;
  const isMine = (h: HandoverItem) => h.isMine ?? h.authorId === me;
  const isUnread = (h: HandoverItem) => !isMine(h) && !(readOver[h.id] ?? h.isRead);

  const items = useMemo(() => data?.items ?? [], [data]);
  const unreadCount = items.filter(isUnread).length;
  const urgentCount = items.filter((h) => h.priority === 'URGENT').length;
  const filtered = items.filter((h) =>
    tab === 'unread' ? isUnread(h) : tab === 'urgent' ? h.priority === 'URGENT' : true
  );

  // 날짜별 묶음 (서버가 날짜 내림차순 · 고정 우선으로 정렬해 줌)
  const groups: { date: string; items: HandoverItem[] }[] = [];
  for (const h of filtered) {
    const last = groups[groups.length - 1];
    if (last && last.date === h.date) last.items.push(h);
    else groups.push({ date: h.date, items: [h] });
  }
  const today = kstTodayKey();

  async function markRead(h: HandoverItem) {
    if (pendingId) return;
    setPendingId(h.id);
    setReadOver(h.id, true);
    try {
      await confirmHandover(h.id);
      toast('확인했어요', 'success');
      refreshBadges();
      void refresh();
    } catch (e) {
      setReadOver(h.id, undefined);
      toast(errorText(e, '확인 처리하지 못했어요'), 'error');
    } finally {
      setPendingId(null);
    }
  }

  async function toggleItem(itemId: string, kind: 'TASK' | 'CHECKLIST', next: boolean) {
    setItemOver(itemId, next);
    try {
      await toggleHandoverItem(itemId, kind);
      void refresh();
    } catch (e) {
      setItemOver(itemId, undefined);
      toast(errorText(e, '체크하지 못했어요'), 'error');
    }
  }

  return (
    <Screen
      kind="push"
      title="인수인계"
      backFallback="/(staff)/(tabs)"
      maxWidth={isTablet ? 720 : undefined}
      right={<HeaderIconButton icon={Plus} label="인수인계 쓰기" onPress={() => setCreating(true)} />}
      refreshing={refreshing}
      onRefresh={onRefresh}>
      {!data ? (
        error && !isLoading ? (
          <ErrorState message={error} onRetry={() => void retry()} />
        ) : (
          <Stack>
            <ListSkeleton rows={2} />
            <ListSkeleton rows={2} />
          </Stack>
        )
      ) : (
        <Stack>
          <SegmentTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'all', label: '전체', count: items.length },
              { value: 'unread', label: '미확인', count: unreadCount },
              { value: 'urgent', label: '긴급', count: urgentCount },
            ]}
          />
          {groups.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={tab === 'unread' ? '모두 확인했어요' : tab === 'urgent' ? '긴급 인수인계가 없어요' : '최근 2주 인수인계가 없어요'}
              description={tab === 'all' ? '다음 근무자에게 전할 내용을 남겨 보세요' : undefined}
              action={
                tab === 'all' ? (
                  <Button size="md" variant="weak" icon={Plus} onPress={() => setCreating(true)}>
                    인수인계 쓰기
                  </Button>
                ) : undefined
              }
            />
          ) : (
            groups.map((g) => (
              <View key={g.date}>
                <GroupLabel trailing={`${g.items.length}건`}>
                  {g.date === today ? `오늘 · ${formatDateKey(g.date)}` : formatDateKey(g.date)}
                </GroupLabel>
                <Stack>
                  {g.items.map((h) => (
                    <HandoverCard
                      key={h.id}
                      handover={h}
                      mine={isMine(h)}
                      read={!isUnread(h)}
                      confirming={pendingId === h.id}
                      checked={(id, fallback) => itemOver[id] ?? fallback}
                      onConfirm={() => void markRead(h)}
                      onToggle={(id, kind, next) => void toggleItem(id, kind, next)}
                    />
                  ))}
                </Stack>
              </View>
            ))
          )}
        </Stack>
      )}

      {creating && (
        <CreateSheet
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            setTab('all');
            await refresh();
          }}
        />
      )}
    </Screen>
  );
}

function HandoverCard({
  handover: h,
  mine,
  read,
  confirming,
  checked,
  onConfirm,
  onToggle,
}: {
  handover: HandoverItem;
  mine: boolean;
  read: boolean;
  confirming: boolean;
  checked: (id: string, fallback: boolean) => boolean;
  onConfirm: () => void;
  onToggle: (id: string, kind: 'TASK' | 'CHECKLIST', next: boolean) => void;
}) {
  const urgent = h.priority === 'URGENT';
  const tasksDone = h.tasks.filter((t) => checked(t.id, t.isCompleted)).length;
  const checksDone = h.checklist.filter((c) => checked(c.id, c.isChecked)).length;

  return (
    <Section
      style={
        !read
          ? { borderWidth: 1.5, borderColor: urgent ? color.stroke.criticalWeak : color.stroke.brandWeak }
          : undefined
      }>
      <Stack gap={space.x3}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x1, flexWrap: 'wrap' }}>
          {urgent ? <Badge tone="bad" solid>긴급</Badge> : <Badge>일반</Badge>}
          {h.category ? <Badge tone="info">{h.category}</Badge> : null}
          {!read ? <Badge tone="brand">미확인</Badge> : null}
          <View style={{ flex: 1 }} />
          {h.isPinned ? (
            <Pin color={color.fg.warning} fill={color.bg.warningSolid} size={16} accessibilityLabel="고정됨" />
          ) : null}
        </View>

        <Text variant="t5-regular" selectable>
          {h.content}
        </Text>

        <Text variant="t3-regular" color="neutralSubtle">
          {`${h.authorName} · ${kstDateTime(h.createdAt)}${h.recipientName ? ` · 받는 사람 ${h.recipientName}` : ''}`}
        </Text>

        {h.tasks.length > 0 && (
          <View style={{ backgroundColor: color.bg.layerFill, borderRadius: radius.r3, paddingVertical: space.x1 }}>
            <Text variant="t3-bold" color="neutralMuted" style={{ paddingHorizontal: space.x4, paddingTop: space.x2 }}>
              {`할 일 ${tasksDone}/${h.tasks.length}`}
            </Text>
            {h.tasks.map((t) => {
              const on = checked(t.id, t.isCompleted);
              return (
                <CheckRow
                  key={t.id}
                  inset={false}
                  checked={on}
                  title={t.title}
                  description={t.assigneeName ? `담당 ${t.assigneeName}` : undefined}
                  onPress={() => onToggle(t.id, 'TASK', !on)}
                />
              );
            })}
          </View>
        )}

        {h.checklist.length > 0 && (
          <View style={{ backgroundColor: color.bg.layerFill, borderRadius: radius.r3, paddingVertical: space.x1 }}>
            <Text variant="t3-bold" color="neutralMuted" style={{ paddingHorizontal: space.x4, paddingTop: space.x2 }}>
              {`체크리스트 ${checksDone}/${h.checklist.length}`}
            </Text>
            {h.checklist.map((c) => {
              const on = checked(c.id, c.isChecked);
              return (
                <CheckRow
                  key={c.id}
                  inset={false}
                  checked={on}
                  title={c.title}
                  onPress={() => onToggle(c.id, 'CHECKLIST', !on)}
                />
              );
            })}
          </View>
        )}

        <Divider />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
          <Eye color={color.fg.neutralSubtle} size={16} strokeWidth={2} />
          <Text variant="t3-regular" color="neutralSubtle" style={{ flex: 1 }} tabular>
            {mine
              ? `내가 쓴 인수인계 · ${h.readCount}명 확인`
              : read
                ? `확인했어요 · ${h.readCount}명 확인`
                : `${h.readCount}명 확인`}
          </Text>
          {!mine && !read ? (
            <Button size="sm" loading={confirming} onPress={onConfirm}>
              확인했어요
            </Button>
          ) : null}
        </View>
      </Stack>
    </Section>
  );
}

function CreateSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [priority, setPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    if (!content.trim()) {
      toast('전달할 내용을 적어 주세요', 'error');
      return;
    }
    setSaving(true);
    try {
      await createHandover({ category: category.trim(), content: content.trim(), priority });
      toast('인수인계를 남겼어요', 'success');
      await onCreated();
    } catch (e) {
      toast(errorText(e, '인수인계를 등록하지 못했어요'), 'error');
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      dismissible={!saving}
      title="새 인수인계"
      description="다음 근무자가 꼭 알아야 할 내용을 남겨요"
      footer={
        <>
          <View style={{ flex: 1 }}>
            <Button variant="gray" block onPress={onClose} disabled={saving}>
              취소
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button block loading={saving} disabled={!content.trim()} onPress={() => void submit()}>
              남기기
            </Button>
          </View>
        </>
      }>
      <Segmented
        value={priority}
        onChange={setPriority}
        options={[
          { value: 'NORMAL', label: '일반' },
          { value: 'URGENT', label: '긴급' },
        ]}
      />
      <TextField
        label="분류"
        indicator="선택"
        value={category}
        onChangeText={setCategory}
        maxLength={40}
        placeholder="예: 시설, 학생, 마감"
      />
      <TextField
        label="내용"
        value={content}
        onChangeText={setContent}
        multiline
        minHeight={140}
        maxLength={8000}
        showCount
        placeholder="다음 근무자에게 전할 내용을 적어 주세요"
      />
    </BottomSheet>
  );
}
