import { ClipboardCheck, Gift, History, Moon, Wifi, type LucideIcon } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  EmptyState,
  ErrorState,
  Press,
  Text,
  color,
  radius,
  space,
  GroupLabel,
  Notice,
  Screen,
  Section,
  Segmented,
  Stack,
  confirm,
  toast,
} from '@/design';
import {
  ApprovalCard,
  ApprovalSkeleton,
  CardGrid,
  RejectSheet,
  approvalKey,
} from '@/features/staff-inbox/approvals';
import { APPROVAL_KIND_LABEL } from '@/features/staff-inbox/status';
import { errorText } from '@/features/staff-inbox/ui';
import {
  decideApproval,
  staffInboxPaths,
  type ApprovalDecision,
  type ApprovalItem,
  type ApprovalKind,
  type ApprovalsResponse,
} from '@/lib/api/staff-inbox';
import { refreshBadges } from '@/lib/badges';
import { useMobileQuery } from '@/lib/mobile-api';
import { useResponsive } from '@/lib/responsive';

type Mode = 'pending' | 'history';

const KINDS: ApprovalKind[] = ['nap', 'network', 'redemption', 'exam-application'];

const TAB_LABEL: Record<ApprovalKind, string> = {
  nap: '쪽잠',
  network: '네트워크',
  redemption: '포인트',
  'exam-application': '모의고사',
};

const KIND_ICON: Record<ApprovalKind, LucideIcon> = {
  nap: Moon,
  network: Wifi,
  redemption: Gift,
  'exam-application': ClipboardCheck,
};

const SUMMARY_KEY = {
  nap: 'nap',
  network: 'network',
  redemption: 'redemption',
  'exam-application': 'examApplication',
} as const;

function successMessage(item: ApprovalItem, decision: ApprovalDecision) {
  if (decision === 'FULFILL') return '지급 완료로 바꿨어요';
  if (item.kind === 'exam-application') return decision === 'APPROVE' ? '신청을 확정했어요' : '신청을 반려했어요';
  if (decision === 'REJECT') return '거절했어요';
  if (item.kind === 'redemption') return '승인했어요. 지급 대기로 옮겼어요';
  return '승인했어요';
}

/**
 * 승인함 — 쪽잠 · 네트워크 · 포인트 교환 · 모의고사 신청을 한곳에서 처리.
 * 처리하면 카드를 바로 치우고(실패 시 되돌림) 학생에게 알림이 간다.
 */
export default function StaffApprovalsScreen() {
  const { isTablet } = useResponsive();
  const [mode, setMode] = useState<Mode>('pending');
  const [kindChoice, setKindChoice] = useState<ApprovalKind | null>(null);
  const { data, error, isLoading, isRefreshing, refresh, retry } = useMobileQuery<ApprovalsResponse>(
    staffInboxPaths.approvals(mode === 'history'),
  );

  // 낙관적 처리: 치운 카드 · 지급 대기로 옮긴 포인트 교환
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [moved, setMoved] = useState<Set<string>>(() => new Set());
  const inflight = useRef(new Set<string>());
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [rejecting, setRejecting] = useState<ApprovalItem | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  // 처음 대기 목록을 받으면 대기 건이 있는 첫 종류로 (이후엔 직원이 고른 대로)
  if (kindChoice === null && data?.mode === 'pending') {
    setKindChoice(KINDS.find((k) => data.summary[SUMMARY_KEY[k]] > 0) ?? 'nap');
  }
  const kind: ApprovalKind = kindChoice ?? 'nap';

  // 현재 모드의 응답만 쓴다 (모드 전환 직후 이전 응답이 잠깐 남는 것 방지)
  const current = data && data.mode === mode ? data : null;

  const items = useMemo(() => {
    const all = current?.items ?? [];
    if (mode !== 'pending') return all;
    return all
      .filter((i) => !hidden.has(approvalKey(i)))
      .map((i) =>
        i.kind === 'redemption' && i.status === 'PENDING' && moved.has(approvalKey(i))
          ? { ...i, status: 'APPROVED' as const, balance: null }
          : i,
      );
  }, [current, hidden, moved, mode]);

  // 대기 건수 — 대기 목록을 받은 뒤엔 낙관적 처리까지 반영, 내역 모드에선 서버 집계
  const counts = useMemo(
    () =>
      Object.fromEntries(
        KINDS.map((k) => [
          k,
          mode === 'pending' && current
            ? items.filter((i) => i.kind === k && i.status === 'PENDING').length
            : (data?.summary[SUMMARY_KEY[k]] ?? 0),
        ]),
      ) as Record<ApprovalKind, number>,
    [items, mode, current, data],
  );

  const list = items.filter((i) => i.kind === kind);

  async function decide(item: ApprovalItem, decision: ApprovalDecision, note?: string) {
    const key = approvalKey(item);
    if (inflight.current.has(key)) return;
    inflight.current.add(key);
    setBusyKey(key);
    const move = item.kind === 'redemption' && decision === 'APPROVE';
    if (move) setMoved((s) => new Set(s).add(key));
    else setHidden((s) => new Set(s).add(key));
    try {
      await decideApproval(item.kind, item.id, decision, note);
      toast(successMessage(item, decision), 'success');
      refreshBadges();
      void refresh();
    } catch (e) {
      const undo = (s: Set<string>) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      };
      if (move) setMoved(undo);
      else setHidden(undo);
      toast(errorText(e), 'error');
      void refresh();
    } finally {
      inflight.current.delete(key);
      setBusyKey((k) => (k === key ? null : k));
    }
  }

  async function fulfill(item: ApprovalItem) {
    if (item.kind !== 'redemption') return;
    const ok = await confirm({
      title: '지급 완료로 바꿀까요?',
      message: `${item.student.name} 학생에게 ‘${item.itemName}’을 보냈다면 지급 완료로 바꿔 주세요.`,
      confirmText: '지급 완료',
    });
    if (ok) void decide(item, 'FULFILL');
  }

  const openReject = (item: ApprovalItem) => {
    setRejectNote('');
    setRejecting(item);
  };
  const confirmReject = () => {
    const item = rejecting;
    setRejecting(null);
    if (item) void decide(item, 'REJECT', rejectNote);
  };

  const columns = isTablet ? 2 : 1;
  const card = (item: ApprovalItem) => (
    <ApprovalCard
      key={approvalKey(item)}
      item={item}
      busy={busyKey === approvalKey(item)}
      onApprove={mode === 'pending' ? () => void decide(item, 'APPROVE') : undefined}
      onReject={mode === 'pending' ? () => openReject(item) : undefined}
      onFulfill={mode === 'pending' ? () => void fulfill(item) : undefined}
    />
  );

  let body: React.ReactNode;
  if (isLoading && !current) body = <ApprovalSkeleton />;
  else if (error && !current) body = <ErrorState message={error} onRetry={() => void retry()} />;
  else if (!current) body = <ApprovalSkeleton />;
  else if (list.length === 0) {
    body = (
      <Section>
        {mode === 'pending' ? (
          <EmptyState
            icon={KIND_ICON[kind]}
            tone="ok"
            title={`대기 중인 ${APPROVAL_KIND_LABEL[kind]} 신청이 없어요`}
            description="새 신청이 들어오면 여기에 보여요."
          />
        ) : (
          <EmptyState
            icon={History}
            title={`최근 14일 동안 처리한 ${APPROVAL_KIND_LABEL[kind]} 신청이 없어요`}
          />
        )}
      </Section>
    );
  } else if (mode === 'pending' && kind === 'redemption') {
    const waiting = list.filter((i) => i.status === 'PENDING');
    const toFulfill = list.filter((i) => i.status === 'APPROVED');
    body = (
      <Stack>
        {waiting.length > 0 ? (
          <Stack gap={0}>
            <GroupLabel trailing={`${waiting.length}건`}>승인 대기</GroupLabel>
            <CardGrid columns={columns}>{waiting.map(card)}</CardGrid>
          </Stack>
        ) : null}
        {toFulfill.length > 0 ? (
          <Stack gap={0}>
            <GroupLabel trailing={`${toFulfill.length}건`}>지급 대기</GroupLabel>
            <CardGrid columns={columns}>{toFulfill.map(card)}</CardGrid>
          </Stack>
        ) : null}
      </Stack>
    );
  } else {
    body = <CardGrid columns={columns}>{list.map(card)}</CardGrid>;
  }

  return (
    <Screen
      kind="push"
      title="승인함"
      backFallback="/(staff)/(tabs)"
      refreshing={isRefreshing}
      onRefresh={() => void refresh()}
      maxWidth={isTablet ? 820 : undefined}>
      <Stack>
        <Segmented
          options={[
            { value: 'pending', label: '대기 중' },
            { value: 'history', label: '처리 내역' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <KindPicker value={kind} onChange={setKindChoice} counts={counts} />
        {mode === 'history' ? (
          <Notice tone="gray" icon={History}>
            최근 14일 동안 처리한 신청을 보여 줘요.
          </Notice>
        ) : null}
        {body}
      </Stack>

      <RejectSheet
        item={rejecting}
        note={rejectNote}
        onChangeNote={setRejectNote}
        onClose={() => setRejecting(null)}
        onConfirm={confirmReject}
      />
    </Screen>
  );
}

/** 신청 종류 고르기 — 4칸 타일(아이콘 · 이름 · 대기 건수). 선택된 칸은 검은 테두리 */
function KindPicker({
  value,
  onChange,
  counts,
}: {
  value: ApprovalKind;
  onChange: (k: ApprovalKind) => void;
  counts: Record<ApprovalKind, number>;
}) {
  return (
    <View style={s.kinds} accessibilityRole="tablist">
      {KINDS.map((k) => {
        const on = k === value;
        const Icon = KIND_ICON[k];
        const count = counts[k];
        return (
          <Press
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${APPROVAL_KIND_LABEL[k]}${count > 0 ? `, 대기 ${count}건` : ''}`}
            style={[s.kind, on && s.kindOn]}>
            <Icon color={on ? color.fg.neutral : color.fg.neutralSubtle} size={20} strokeWidth={2.2} />
            <Text variant={on ? 't3-bold' : 't3-medium'} color={on ? 'neutral' : 'neutralMuted'} numberOfLines={1}>
              {TAB_LABEL[k]}
            </Text>
            <Text variant="t5-bold" tabular color={count > 0 ? (on ? 'brand' : 'neutral') : 'neutralSubtle'}>
              {count}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  kinds: { flexDirection: 'row', gap: space.x2 },
  kind: {
    flex: 1,
    minWidth: 0,
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x1,
    paddingHorizontal: space.x1,
    paddingVertical: space.x2_5,
    borderRadius: radius.r4,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: color.bg.layerDefault,
  },
  kindOn: { borderColor: color.stroke.neutralContrast },
});
