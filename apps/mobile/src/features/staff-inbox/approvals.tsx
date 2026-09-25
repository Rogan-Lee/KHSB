import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Avatar,
  Badge,
  Button,
  BottomSheet,
  Section,
  Skeleton,
  Stack,
  Text,
  TextField,
  color,
  radius,
  space,
} from '@/design';
import type { ApprovalItem, ApprovalKind } from '@/lib/api/staff-inbox';
import { splitColumns } from '@/lib/responsive';

import { APPROVAL_KIND_LABEL, approvalStatusMeta } from './status';
import {
  formatDateOnly,
  formatDecidedAt,
  formatInboxTime,
  formatPoints,
  formatTimeRange,
} from './time';

export const approvalKey = (item: Pick<ApprovalItem, 'kind' | 'id'>) => `${item.kind}:${item.id}`;

/** 잔액이 모자라 승인할 수 없는 포인트 교환 */
export function lacksBalance(item: ApprovalItem) {
  return item.kind === 'redemption' && item.status === 'PENDING' && item.balance != null && item.balance < item.points;
}

/** 신청 카드 — 학생 · 신청 내용 · 처리 버튼(대기) 또는 처리 결과(내역) */
export function ApprovalCard({
  item,
  busy = false,
  onApprove,
  onReject,
  onFulfill,
}: {
  item: ApprovalItem;
  busy?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onFulfill?: () => void;
}) {
  const status = approvalStatusMeta(item);
  const pending = item.status === 'PENDING';
  const awaitingFulfill = item.kind === 'redemption' && item.status === 'APPROVED' && !!onFulfill;
  const exam = item.kind === 'exam-application';
  const noBalance = lacksBalance(item);

  return (
    <Section>
      <View style={{ gap: space.x4 }}>
        <View style={s.head}>
          <Avatar name={item.student.name} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="t5-bold" numberOfLines={1}>
              {item.student.name}
            </Text>
            <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1}>
              {item.student.grade}
              {item.student.seat ? ` · 좌석 ${item.student.seat}` : ''}
            </Text>
          </View>
          {pending ? (
            <Text variant="t3-regular" color="neutralSubtle" tabular>
              {formatInboxTime(item.requestedAt)}
            </Text>
          ) : (
            <Badge tone={status.tone}>{status.label}</Badge>
          )}
        </View>

        <ApprovalBody item={item} />

        {pending && (onApprove || onReject) ? (
          <View style={s.actions}>
            <Button
              variant="weak"
              size="md"
              disabled={busy}
              onPress={onReject}
              style={s.action}
              accessibilityLabel={`${item.student.name} ${APPROVAL_KIND_LABEL[item.kind]} ${exam ? '반려' : '거절'}`}>
              {exam ? '반려' : '거절'}
            </Button>
            <Button
              variant="primary"
              size="md"
              disabled={busy || noBalance}
              onPress={onApprove}
              style={s.action}
              accessibilityLabel={`${item.student.name} ${APPROVAL_KIND_LABEL[item.kind]} ${exam ? '확정' : '승인'}`}>
              {noBalance ? '잔액 부족' : exam ? '확정' : '승인'}
            </Button>
          </View>
        ) : awaitingFulfill ? (
          <Button variant="dark" size="md" disabled={busy} onPress={onFulfill} style={{ height: 44 }}>
            지급 완료로 바꾸기
          </Button>
        ) : null}

        {!pending ? <DecisionFooter item={item} /> : null}
      </View>
    </Section>
  );
}

function ApprovalBody({ item }: { item: ApprovalItem }) {
  switch (item.kind) {
    case 'nap':
      return (
        <View style={{ gap: space.x1 }}>
          <Text variant="t7-bold" tabular>
            {`${item.startTime} · ${item.durationMin}분`}
          </Text>
          <Text variant="t4-regular" color="neutralSubtle">
            {`${formatDateOnly(item.date)} 쪽잠`}
          </Text>
        </View>
      );
    case 'network':
      return (
        <View style={{ gap: space.x2 }}>
          <View style={s.inline}>
            <Badge tone="info">{item.networkKindLabel}</Badge>
            {item.expired ? <Badge tone="warn">사용 시간 지남</Badge> : null}
          </View>
          {item.target ? (
            <Text variant="t5-bold" numberOfLines={2}>
              {item.target}
            </Text>
          ) : null}
          <Text variant="t4-regular" color="neutralMuted" tabular>
            {formatTimeRange(item.startAt, item.endAt)}
          </Text>
          <Quote label="사유">{item.reason}</Quote>
        </View>
      );
    case 'redemption': {
      const low = lacksBalance(item);
      return (
        <View style={{ gap: space.x2 }}>
          <View style={[s.inline, { justifyContent: 'space-between' }]}>
            <Text variant="t5-bold" numberOfLines={2} style={{ flexShrink: 1 }}>
              {item.itemName}
            </Text>
            <Text variant="t6-bold" color="brand" tabular>
              {formatPoints(item.points)}
            </Text>
          </View>
          {item.balance != null ? (
            <Text variant="t4-regular" color={low ? 'critical' : 'neutralSubtle'} tabular>
              {low
                ? `잔액이 부족해요 · 현재 ${formatPoints(item.balance)}`
                : `현재 잔액 ${formatPoints(item.balance)} → 승인 후 ${formatPoints(item.balance - item.points)}`}
            </Text>
          ) : null}
          {item.note && item.status !== 'REJECTED' ? <Quote label="학생 메모">{item.note}</Quote> : null}
        </View>
      );
    }
    case 'exam-application':
      return (
        <View style={{ gap: space.x2 }}>
          <Text variant="t5-bold" numberOfLines={2}>
            {item.sessionTitle}
          </Text>
          <Text variant="t4-regular" color="neutralMuted">
            {`${formatDateOnly(item.examDate)} · ${item.room}관`}
          </Text>
          {item.subjects.length > 0 ? (
            <View style={s.inline}>
              {item.subjects.map((subject) => (
                <Badge key={subject} tone="gray">
                  {subject}
                </Badge>
              ))}
            </View>
          ) : null}
          {item.memo ? <Quote label="요청사항">{item.memo}</Quote> : null}
        </View>
      );
  }
}

function DecisionFooter({ item }: { item: ApprovalItem }) {
  const by = item.decidedByName ?? '운영진';
  const reason =
    (item.kind === 'nap' && item.note) || (item.kind === 'redemption' && item.status === 'REJECTED' && item.note)
      ? item.note
      : null;
  return (
    <View style={s.footer}>
      <Text variant="t3-regular" color="neutralSubtle">
        {item.decidedAt ? `${by} · ${formatDecidedAt(item.decidedAt)} 처리` : `${by} 처리`}
      </Text>
      {reason ? (
        <Text variant="t3-regular" color="neutralMuted">
          {`메모: ${reason}`}
        </Text>
      ) : null}
    </View>
  );
}

function Quote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={s.quote}>
      <Text variant="t2-bold" color="neutralSubtle">
        {label}
      </Text>
      <Text variant="t4-regular" selectable>
        {children}
      </Text>
    </View>
  );
}

/** 태블릿에서는 카드 2열 (위→아래로 읽고 다음 열) */
export function CardGrid({ columns, children }: { columns: number; children: ReactNode[] }) {
  if (columns <= 1) return <Stack>{children}</Stack>;
  return (
    <View style={{ flexDirection: 'row', gap: space.x3, alignItems: 'flex-start' }}>
      {splitColumns(children, columns).map((col, i) => (
        <Stack key={i} style={{ flex: 1, minWidth: 0 }}>
          {col}
        </Stack>
      ))}
    </View>
  );
}

export function ApprovalSkeleton() {
  return (
    <Stack>
      {[0, 1].map((i) => (
        <Section key={i}>
          <View style={{ gap: space.x4 }}>
            <View style={s.head}>
              <Skeleton style={{ width: 40, height: 40, borderRadius: 20 }} />
              <View style={{ flex: 1, gap: space.x1_5 }}>
                <Skeleton style={{ width: '35%', height: 16 }} />
                <Skeleton style={{ width: '25%', height: 13 }} />
              </View>
            </View>
            <Skeleton style={{ width: '55%', height: 24 }} />
            <View style={s.actions}>
              <Skeleton style={{ flex: 1, height: 44, borderRadius: radius.r2 }} />
              <Skeleton style={{ flex: 1, height: 44, borderRadius: radius.r2 }} />
            </View>
          </View>
        </Section>
      ))}
    </Stack>
  );
}

// ─── 거절(반려) 사유 시트 ───────────────────────────────────────────

const REJECT_PLACEHOLDER: Record<ApprovalKind, string> = {
  nap: '예) 지금은 쪽잠 자리가 없어요',
  network: '예) 자습 시간에는 허용하기 어려워요',
  redemption: '예) 이번 달 상품 재고가 없어요',
  'exam-application': '예) 신청 정원이 마감됐어요',
};

export function RejectSheet({
  item,
  note,
  onChangeNote,
  onClose,
  onConfirm,
}: {
  item: ApprovalItem | null;
  note: string;
  onChangeNote: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const exam = item?.kind === 'exam-application';
  const verb = exam ? '반려' : '거절';
  // 쪽잠·포인트 교환은 사유가 저장돼 학생 포털에 보이고, 네트워크·모의고사는 알림으로만 전해진다
  const stored = item?.kind === 'nap' || item?.kind === 'redemption';
  return (
    <BottomSheet
      open={item != null}
      onClose={onClose}
      title={`신청을 ${verb}할까요?`}
      description={item ? `${item.student.name} 학생의 ${APPROVAL_KIND_LABEL[item.kind]} 신청이에요.` : undefined}
      footer={
        <>
          <Button variant="gray" size="lg" onPress={onClose} style={{ flex: 1 }}>
            취소
          </Button>
          <Button variant="danger" size="lg" onPress={onConfirm} style={{ flex: 1 }}>
            {`${verb}하기`}
          </Button>
        </>
      }>
      <TextField
        label={`${verb} 사유`}
        indicator="선택"
        value={note}
        onChangeText={onChangeNote}
        placeholder={item ? REJECT_PLACEHOLDER[item.kind] : undefined}
        multiline
        minHeight={96}
        maxLength={200}
        showCount
        description={stored ? '학생 앱·포털과 알림에 함께 보여요.' : '학생에게 알림으로 전달돼요.'}
      />
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.x1_5 },
  actions: { flexDirection: 'row', gap: space.x2 },
  action: { flex: 1, height: 44 },
  quote: {
    gap: space.x0_5,
    backgroundColor: color.bg.layerFill,
    borderRadius: radius.r3,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2_5,
  },
  footer: {
    gap: space.x0_5,
    paddingTop: space.x3,
    borderTopWidth: 1,
    borderTopColor: color.stroke.neutralSubtle,
  },
});
