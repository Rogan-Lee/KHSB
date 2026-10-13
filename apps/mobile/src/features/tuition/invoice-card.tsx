import { Clock, Copy, Info, Landmark, RefreshCw, Store } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  color,
  IconTile,
  InfoRow,
  Notice,
  radius,
  Section,
  space,
  Text,
  TONE_CALLOUT,
} from '@/design';
import { copyText } from '@/features/lunch/clipboard';
import type { ParentTuitionInvoice } from '@/lib/api/parent-tuition';

import {
  daysUntil,
  dotDate,
  dueMeta,
  invoiceStatusMeta,
  kstDateTimeLabel,
  ONSITE_METHOD_LABEL,
  periodLabel,
  won,
} from './format';

/**
 * 결제할 청구서 한 장 — 제목 · 상태 · 금액 · 이용 기간 · 납부 기한 + 지금 상태 안내.
 * 상태 안내는 하나만 보인다: 결제 확인 중 → 현장 결제 신청 → 가상계좌 입금 대기 → 결제창을 열어 둔 상태.
 */
export function OpenInvoiceCard({
  invoice,
  checking,
  withdrawing,
  locked,
  hint,
  onWithdraw,
  onConfirmPayment,
}: {
  invoice: ParentTuitionInvoice;
  /** 이 청구서의 결제를 확인하는 중 */
  checking: boolean;
  /** 이 청구서의 현장 결제 신청을 철회하는 중 */
  withdrawing: boolean;
  /** 다른 요청이 진행 중 — 버튼을 잠근다 */
  locked: boolean;
  /** 카드 맨 아래 한 줄 안내 (하단 버튼의 대상이 아닌 청구서) */
  hint?: string;
  onWithdraw: () => void;
  onConfirmPayment: () => void;
}) {
  const status = invoiceStatusMeta(invoice.status);
  const due = dueMeta(invoice.daysToDue ?? daysUntil(invoice.dueDate));
  const onsite = invoice.onsiteRequest ?? null;
  const deposit = invoice.linkPending?.deposit ?? null;
  const months = invoice.months ?? 1;
  // 금액 구성은 추가 항목·할인·부가세가 있을 때만 펼친다 (수강료 한 줄뿐이면 금액과 같은 말이다)
  const breakdown = invoice.breakdown ?? null;
  const extraItems = breakdown?.extraItems ?? [];
  const tax = invoice.tax ?? null;
  const showBreakdown = breakdown != null && (extraItems.length > 0 || breakdown.discount > 0 || tax != null);
  const message = invoice.message?.trim() || null;

  let state = null;
  if (checking) {
    state = (
      <View style={[s.checking, { backgroundColor: TONE_CALLOUT.info.bg }]} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={TONE_CALLOUT.info.fg} />
        <Text variant="t4-bold" color={TONE_CALLOUT.info.fg} style={{ flex: 1 }}>
          결제를 확인하고 있어요
        </Text>
      </View>
    );
  } else if (onsite) {
    const method = ONSITE_METHOD_LABEL[onsite.method];
    state = (
      <>
        <Notice tone="info" icon={Store} title="현장 결제를 신청했어요">
          {method ? `독서실에서 ${method}로 결제하시면 확인해 드려요.` : '독서실에서 결제하시면 확인해 드려요.'}
        </Notice>
        <Button
          variant="gray"
          size="md"
          loading={withdrawing}
          disabled={locked}
          onPress={onWithdraw}
          style={s.action}>
          신청 철회
        </Button>
      </>
    );
  } else if (deposit) {
    const account = deposit.accountNumber;
    const dueAt = kstDateTimeLabel(deposit.dueAt);
    state = (
      <>
        <Notice tone="warn" icon={Clock} title="입금을 기다리고 있어요">
          {account ? '아래 계좌로 입금하시면 자동으로 확인돼요.' : '입금이 확인되면 알려 드려요.'}
        </Notice>
        {account ? (
          <View style={s.bank}>
            <IconTile icon={Landmark} tone="brand" size={40} round />
            <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
              <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1}>
                {deposit.bank || '입금 계좌'}
              </Text>
              <Text variant={account.length <= 14 ? 't6-bold' : 't5-bold'} tabular selectable numberOfLines={2}>
                {account}
              </Text>
            </View>
            <Button
              variant="weak"
              size="sm"
              icon={Copy}
              accessibilityLabel="계좌번호 복사"
              onPress={() => void copyText(account, '계좌번호를 복사했어요')}>
              복사
            </Button>
          </View>
        ) : null}
        {dueAt ? <InfoRow label="입금 기한">{`${dueAt}까지`}</InfoRow> : null}
      </>
    );
  } else if (invoice.linkPending) {
    state = (
      <>
        <Notice tone="gray" icon={Info}>
          결제를 완료하셨다면 잠시 후 반영돼요
        </Notice>
        <Button
          variant="gray"
          size="md"
          icon={RefreshCw}
          disabled={locked}
          onPress={onConfirmPayment}
          style={s.action}>
          결제 확인
        </Button>
      </>
    );
  }

  return (
    <Section>
      <View style={s.head}>
        <Text variant="t6-bold" numberOfLines={2} style={{ flex: 1, minWidth: 0 }}>
          {invoice.title}
        </Text>
        {status && (
          <Badge tone={status.tone} size="md">
            {status.label}
          </Badge>
        )}
      </View>
      <Text variant="t11-bold" tabular accessibilityRole="header" style={{ marginTop: space.x1 }}>
        {won(invoice.amount)}
      </Text>

      <View style={s.info}>
        <InfoRow label="이용 기간">
          <View style={{ alignItems: 'flex-end', gap: space.x0_5 }}>
            <Text variant="t5-medium" tabular align="right">
              {periodLabel(invoice.periodStart, invoice.periodEnd)}
            </Text>
            {months > 1 && (
              <Text variant="t4-regular" color="neutralSubtle" tabular align="right">
                {months}개월
              </Text>
            )}
          </View>
        </InfoRow>
        <InfoRow label="납부 기한">
          <View style={s.due}>
            <Text variant="t5-medium" tabular>
              {dotDate(invoice.dueDate)}
            </Text>
            <Badge tone={due.tone} style={{ alignSelf: 'center' }}>
              {due.label}
            </Badge>
          </View>
        </InfoRow>
      </View>

      {showBreakdown && (
        <View style={s.breakdown}>
          <InfoRow label={months > 1 ? `수강료 (월 ${won(breakdown.monthlyFee)} × ${months}개월)` : '수강료'}>
            <Text variant="t5-medium" tabular align="right">
              {won(breakdown.tuition)}
            </Text>
          </InfoRow>
          {extraItems.map((item, i) => (
            <InfoRow key={`${item.name}-${i}`} label={item.name}>
              <Text variant="t5-medium" tabular align="right">
                {won(item.amount)}
              </Text>
            </InfoRow>
          ))}
          {breakdown.discount > 0 && (
            <InfoRow label="할인">
              <Text variant="t5-medium" tabular align="right">
                −{won(breakdown.discount)}
              </Text>
            </InfoRow>
          )}
          {tax != null && (
            <InfoRow label="공급가액 · 부가세">
              <Text variant="t5-medium" tabular align="right">
                {`${won(tax.supplyAmount)} · ${won(tax.taxAmount)}`}
              </Text>
            </InfoRow>
          )}
        </View>
      )}

      {message != null && (
        <View style={s.message}>
          <Text variant="t4-regular" color="neutralMuted">
            {message}
          </Text>
        </View>
      )}

      {state != null && <View style={s.state}>{state}</View>}
      {hint != null && state == null && (
        <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x3 }}>
          {hint}
        </Text>
      )}
    </Section>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 },
  info: {
    marginTop: space.x4,
    paddingTop: space.x2,
    borderTopWidth: 1,
    borderTopColor: color.stroke.neutralSubtle,
  },
  due: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: space.x1_5 },
  breakdown: {
    marginTop: space.x2,
    paddingTop: space.x2,
    borderTopWidth: 1,
    borderTopColor: color.stroke.neutralSubtle,
  },
  message: {
    marginTop: space.x3,
    borderRadius: radius.r4,
    backgroundColor: color.bg.layerFill,
    padding: space.x4,
  },
  state: { marginTop: space.x3, gap: space.x2_5 },
  // Notice(SEED Callout)와 같은 모양 — 아이콘 자리에 스피너를 둔다
  checking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    minHeight: 50,
    padding: space.x3_5,
    borderRadius: radius.r2_5,
  },
  action: { alignSelf: 'flex-start' },
  bank: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    borderRadius: radius.r4,
    backgroundColor: color.bg.layerFill,
    paddingVertical: space.x3_5,
    paddingLeft: space.x4,
    paddingRight: space.x3,
  },
});
