import { Clock, Copy, Landmark, Pencil } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  Button,
  color,
  confirm,
  IconTile,
  Markdown,
  Notice,
  radius,
  Section,
  space,
  Text,
  toast,
} from '@/design';

import { lunchSubject, type LunchAdapter, type LunchData } from './adapter';
import { copyText } from './clipboard';
import { LunchFrame, LunchIntro, LunchOrderSummary } from './frame';
import { parseBankInfo, won } from './format';

/** 입금 안내 — 금액 · 계좌(복사) · 신청 내역(수정) · 입금 안내문 · "입금했어요" */
export function LunchPaymentView({
  adapter,
  data,
  refreshing,
  onRefresh,
  onClaimed,
  onEdit,
}: {
  adapter: LunchAdapter;
  data: LunchData;
  refreshing: boolean;
  onRefresh: () => void;
  onClaimed: () => void;
  onEdit: () => void;
}) {
  const order = data.pending!;
  const [busy, setBusy] = useState(false);
  const bank = useMemo(() => (data.bankInfo ? parseBankInfo(data.bankInfo) : null), [data.bankInfo]);

  const claim = async () => {
    if (busy) return;
    const ok = await confirm({
      title: order.depositClaimed ? '입금 확인을 다시 요청할까요?' : '입금하셨나요?',
      message: `${won(order.total)}을 입금하셨다면 관리자에게 확인 요청을 보낼게요.`,
      confirmText: order.depositClaimed ? '다시 요청' : '입금했어요',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await adapter.claimDeposit();
      toast('입금 확인 요청을 보냈어요', 'success');
      onClaimed();
    } catch (e) {
      toast(e instanceof Error ? e.message : '요청하지 못했어요', 'error');
    } finally {
      setBusy(false);
    }
  };

  const footer = order.depositClaimed ? (
    <Button variant="gray" size="xl" block loading={busy} onPress={claim}>
      다시 알림 보내기
    </Button>
  ) : (
    <Button variant="primary" size="xl" block loading={busy} onPress={claim}>
      입금했어요
    </Button>
  );

  return (
    <LunchFrame frame={adapter} footer={footer} refreshing={refreshing} onRefresh={onRefresh}>
      <LunchIntro view="payment" title={lunchSubject(adapter, data)} depositClaimed={order.depositClaimed} />

      {order.depositClaimed && (
        <Notice tone="warn" icon={Clock} title="입금 확인 중이에요">
          관리자가 확인하면 알려드려요. 입금 정보가 다르면 아래에서 다시 알려 주세요.
        </Notice>
      )}

      {/* 송금 카드 — 금액 + 입금 계좌(복사) */}
      <Section>
        <Text variant="t4-medium" color="neutralMuted">
          입금하실 금액
        </Text>
        <Text variant="t11-bold" tabular style={{ marginTop: space.x1 }} accessibilityRole="header">
          {won(order.total)}
        </Text>
        {data.bankInfo ? (
          <View style={s.bank}>
            <IconTile icon={Landmark} tone="brand" size={40} round />
            <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
              <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1}>
                {bank ? `${bank.bank || '입금 계좌'}${bank.holder ? ` · ${bank.holder}` : ''}` : '입금 계좌'}
              </Text>
              {/* 계좌번호는 한 줄로 — 길면 한 단계 작게, 그래도 넘치면 폭에 맞춰 줄임 */}
              <Text
                variant={bank && bank.account.length <= 14 ? 't6-bold' : 't5-bold'}
                tabular
                selectable
                // 웹은 글자 자동 축소가 안 돼서 두 줄까지 허용
                numberOfLines={bank && Platform.OS !== 'web' ? 1 : 2}
                adjustsFontSizeToFit={!!bank}
                minimumFontScale={0.8}>
                {bank ? bank.account : data.bankInfo}
              </Text>
            </View>
            <Button
              variant="weak"
              size="sm"
              icon={Copy}
              accessibilityLabel="계좌번호 복사"
              onPress={() => void copyText(bank ? bank.account : data.bankInfo!, '계좌번호를 복사했어요')}>
              복사
            </Button>
          </View>
        ) : (
          <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x3 }}>
            입금 계좌는 독서실에 문의해 주세요.
          </Text>
        )}
      </Section>

      <LunchOrderSummary
        order={order}
        totalLabel="합계"
        footer={
          <Button variant="weak" size="lg" block icon={Pencil} onPress={onEdit} disabled={busy}>
            신청 날짜·메뉴 수정하기
          </Button>
        }
      />

      {data.guideText ? (
        <Section title="입금 안내">
          <Markdown source={data.guideText} />
        </Section>
      ) : null}
    </LunchFrame>
  );
}

const s = StyleSheet.create({
  bank: {
    marginTop: space.x5,
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
