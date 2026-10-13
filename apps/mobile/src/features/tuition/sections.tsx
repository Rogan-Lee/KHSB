import { CalendarClock, ChevronRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Badge, color, IconTile, Markdown, Press, radius, Section, Skeleton, space, Stack, Text } from '@/design';
import type { ParentTuitionInvoice, ParentTuitionResponse } from '@/lib/api/parent-tuition';
import { isWebUrl } from '@/lib/safe-url';

import { dotDate, invoiceStatusMeta, kstDateKey, nextPaymentText, periodLabel, won } from './format';
import { openReceipt } from './open-page';

/** 수강료 안내 — 운영진이 적어 둔 안내문 (없으면 그리지 않는다) */
export function TuitionGuide({ text }: { text: string | null | undefined }) {
  if (!text?.trim()) return null;
  return (
    <Section title="수강료 안내">
      <Markdown source={text} size="sm" />
    </Section>
  );
}

/** 다음 결제 — 납부 기한 또는 이용 기간이 끝나는 날 안내 (안내할 게 없으면 그리지 않는다) */
export function NextPayment({ next }: { next: ParentTuitionResponse['nextPayment'] | null | undefined }) {
  const text = nextPaymentText(next);
  if (!text) return null;
  return (
    <Section title="다음 결제">
      <View style={s.next}>
        <IconTile icon={CalendarClock} tone="info" size={40} round />
        <Text variant="t5-regular" style={{ flex: 1, minWidth: 0 }}>
          {text}
        </Text>
      </View>
    </Section>
  );
}

/** 납부 내역 — 납부·환불·취소된 지난 청구서 */
export function TuitionHistory({ items }: { items: ParentTuitionInvoice[] }) {
  if (items.length === 0) return null;
  return (
    <Section title="납부 내역">
      <View>
        {items.map((invoice, i) => (
          <HistoryItem key={invoice.id} invoice={invoice} first={i === 0} />
        ))}
      </View>
    </Section>
  );
}

function HistoryItem({ invoice, first }: { invoice: ParentTuitionInvoice; first: boolean }) {
  const status = invoiceStatusMeta(invoice.status);
  const paidKey = kstDateKey(invoice.paidAt);
  const meta = [paidKey ? `${dotDate(paidKey)} 납부` : null, invoice.paidMethodLabel]
    .filter(Boolean)
    .join(' · ');
  const refunded = invoice.refundedAmount ?? 0;
  const refunding = (invoice.refunds ?? [])
    .filter((r) => r.status === 'PENDING')
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);

  return (
    <View style={[s.item, !first && s.itemDivider]}>
      <View style={s.row}>
        <Text variant="t5-medium" numberOfLines={2} style={{ flex: 1, minWidth: 0 }}>
          {invoice.title}
        </Text>
        <Text variant="t5-bold" tabular>
          {won(invoice.amount)}
        </Text>
      </View>
      <View style={s.row}>
        <Text variant="t4-regular" color="neutralSubtle" tabular style={{ flex: 1, minWidth: 0 }}>
          {/* 납부 전에 취소된 청구서는 납부일이 없다 */}
          {meta || periodLabel(invoice.periodStart, invoice.periodEnd)}
        </Text>
        {status && <Badge tone={status.tone}>{status.label}</Badge>}
      </View>
      {(refunded > 0 || refunding > 0) && (
        <View style={s.refund}>
          {refunded > 0 && (
            <Text variant="t4-medium" color="neutralMuted" tabular>
              환불 {won(refunded)}
            </Text>
          )}
          {refunding > 0 && <Badge tone="warn">환불 처리 중 {won(refunding)}</Badge>}
        </View>
      )}
      {isWebUrl(invoice.receiptUrl) && (
        <Press
          onPress={() => void openReceipt(invoice.receiptUrl)}
          scale={0}
          pressedBg
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel={`${invoice.title} 영수증 보기`}
          style={s.receipt}>
          <Text variant="t4-medium" color="neutralMuted">
            영수증
          </Text>
          <ChevronRight color={color.fg.neutralSubtle} size={16} strokeWidth={2.2} />
        </Press>
      )}
    </View>
  );
}

export function TuitionSkeleton() {
  return (
    <Stack>
      <View style={s.skel}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Skeleton style={{ width: 110, height: 24 }} />
          <Skeleton style={{ width: 64, height: 24, borderRadius: radius.r1_5 }} />
        </View>
        <Skeleton style={{ width: 168, height: 36 }} />
        <Skeleton style={{ height: 20, marginTop: space.x2 }} />
        <Skeleton style={{ height: 20 }} />
      </View>
      <View style={s.skel}>
        <Skeleton style={{ width: 96, height: 22 }} />
        <Skeleton style={{ width: '90%', height: 18 }} />
        <Skeleton style={{ width: '70%', height: 18 }} />
      </View>
      <View style={s.skel}>
        <Skeleton style={{ width: 96, height: 22 }} />
        {[0, 1].map((i) => (
          <Skeleton key={i} style={{ height: 44, borderRadius: radius.r2 }} />
        ))}
      </View>
    </Stack>
  );
}

const s = StyleSheet.create({
  next: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  item: { paddingVertical: space.x3_5, gap: space.x1 },
  itemDivider: { borderTopWidth: 1, borderTopColor: color.stroke.neutralSubtle },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 },
  refund: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.x2, marginTop: space.x0_5 },
  receipt: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.x1,
    marginLeft: -space.x1_5,
    paddingHorizontal: space.x1_5,
    paddingVertical: space.x1,
    borderRadius: radius.r2,
  },
  skel: { backgroundColor: color.bg.layerDefault, borderRadius: radius.r5, padding: space.x5, gap: space.x3 },
});
