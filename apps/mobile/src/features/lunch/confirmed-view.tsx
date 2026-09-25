import { Check, CirclePlus, Send } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  color,
  Columns,
  IconTile,
  radius,
  Section,
  space,
  Text,
  TextField,
  toast,
} from '@/design';

import { lunchSubject, type LunchAdapter, type LunchData } from './adapter';
import { LunchFrame, LunchIntro, LunchOrderSummary } from './frame';
import { hasOrderableMenus, kstDateTimeLabel } from './format';

/**
 * 입금 확정 — 확정 내역 · 변경 요청 보내기 · 요청↔반영 스레드 · (열린 주가 있으면) 추가 신청.
 * 태블릿은 두 단: 왼쪽 확정 내역, 오른쪽 변경 요청.
 */
export function LunchConfirmedView({
  adapter,
  data,
  refreshing,
  onRefresh,
  onSent,
  onOrderMore,
}: {
  adapter: LunchAdapter;
  data: LunchData;
  refreshing: boolean;
  onRefresh: () => void;
  onSent: () => void;
  onOrderMore: () => void;
}) {
  const order = data.confirmed!;
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const canOrderMore = hasOrderableMenus(data.menus, data.paidMenuIds);

  const send = async () => {
    if (busy) return;
    if (!msg.trim()) {
      toast('변경 요청 내용을 입력해 주세요', 'error');
      return;
    }
    setBusy(true);
    try {
      await adapter.requestChange(msg.trim());
      toast('변경 요청을 보냈어요', 'success');
      setMsg('');
      onSent();
    } catch (e) {
      toast(e instanceof Error ? e.message : '요청하지 못했어요', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LunchFrame frame={adapter} refreshing={refreshing} onRefresh={onRefresh} wide>
      <LunchIntro view="confirmed" title={lunchSubject(adapter, data)} />

      <Columns
        left={
          <>
            <Section>
              <View style={s.done}>
                <IconTile icon={Check} tone="ok" solid size={44} round />
                <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
                  <Text variant="t6-bold">입금이 확인됐어요</Text>
                  <Text variant="t4-regular" color="neutralSubtle">
                    신청이 최종 확정됐어요. 감사합니다!
                  </Text>
                </View>
              </View>
            </Section>

            <LunchOrderSummary order={order} totalLabel="결제 금액" />

            {canOrderMore && (
              <Section
                title="다음 도시락도 신청할 수 있어요"
                description="아직 마감되지 않은 주의 메뉴가 있어요.">
                <Button variant="weak" size="lg" block icon={CirclePlus} onPress={onOrderMore}>
                  추가 신청하기
                </Button>
              </Section>
            )}
          </>
        }
        right={
          <>
            <Section
              title="변경이 필요하신가요?"
              description="날짜·메뉴 변경, 취소 등 요청을 남기면 관리자가 확인 후 처리해 드려요.">
              <TextField
                value={msg}
                onChangeText={setMsg}
                placeholder="예: 7월 15일 신청을 취소하고 싶어요."
                accessibilityLabel="변경 요청 내용"
                multiline
                minHeight={104}
                maxLength={500}
                showCount
              />
              <Button
                variant="primary"
                size="lg"
                block
                icon={Send}
                loading={busy}
                disabled={!msg.trim()}
                onPress={send}
                style={{ marginTop: space.x3 }}>
                변경 요청 보내기
              </Button>
            </Section>

            {data.changeRequests.length > 0 && (
              <Section
                title={
                  <Text variant="t6-bold">
                    변경 요청 내역{' '}
                    <Text variant="t6-bold" color="neutralSubtle" tabular>
                      {data.changeRequests.length}
                    </Text>
                  </Text>
                }>
                <View style={{ gap: space.x2_5 }}>
                  {data.changeRequests.map((t) => (
                    <View key={t.id} style={s.thread}>
                      <View style={s.threadHead}>
                        <Text variant="t3-bold" color="neutralMuted">
                          내 요청
                        </Text>
                        <Text variant="t2-regular" color="neutralSubtle" tabular>
                          {kstDateTimeLabel(t.createdAt)}
                        </Text>
                      </View>
                      <Text variant="t5-regular" selectable>
                        {t.message}
                      </Text>
                      {t.reply ? (
                        <View style={s.reply}>
                          <View style={s.threadHead}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x1, flexShrink: 1 }}>
                              <Check color={color.fg.positive} size={14} strokeWidth={2.8} />
                              <Text variant="t3-bold" color="positive" numberOfLines={1}>
                                {`운영자 반영${t.repliedByName ? ` · ${t.repliedByName}` : ''}`}
                              </Text>
                            </View>
                            {t.repliedAt && (
                              <Text variant="t2-regular" color="neutralSubtle" tabular>
                                {kstDateTimeLabel(t.repliedAt)}
                              </Text>
                            )}
                          </View>
                          <Text variant="t4-regular" color="neutralMuted" selectable>
                            {t.reply}
                          </Text>
                        </View>
                      ) : (
                        <Badge tone="warn" style={{ marginTop: space.x1 }}>
                          확인 대기중
                        </Badge>
                      )}
                    </View>
                  ))}
                </View>
              </Section>
            )}
          </>
        }
      />
    </LunchFrame>
  );
}

const s = StyleSheet.create({
  done: { flexDirection: 'row', alignItems: 'center', gap: space.x3_5 },
  thread: { backgroundColor: color.bg.layerFill, borderRadius: radius.r4, padding: space.x4, gap: space.x1_5 },
  threadHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.x2 },
  reply: {
    marginTop: space.x1_5,
    backgroundColor: color.bg.layerDefault,
    borderRadius: radius.r3,
    padding: space.x3_5,
    gap: space.x1_5,
  },
});
