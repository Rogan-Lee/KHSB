import { Clock3, History, LogIn, LogOut } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  IconTile,
  InfoRow,
  ListRow,
  Screen,
  Section,
  Skeleton,
  Stack,
  Text,
  TextField,
  space,
  toast,
} from '@/design';
import { errorText, usePullRefresh } from '@/features/staff-home/hooks';
import { kstDateTime } from '@/features/staff-home/format';
import { ListSkeleton } from '@/features/staff-home/ui';
import { clockWork, STAFF_API, type StaffOperationsResponse } from '@/lib/api/staff-home';
import { formatCurrency, formatMinutes } from '@/lib/format';
import { useMobileQuery } from '@/lib/mobile-api';

/** 출퇴근·급여 — 본인 출근/퇴근 기록과 이번 달 예상 정산 */
export default function StaffWorkScreen() {
  const { data, error, isLoading, refresh, retry } = useMobileQuery<StaffOperationsResponse>(
    STAFF_API.operations
  );
  const { refreshing, onRefresh } = usePullRefresh(refresh);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  const working = !!data?.clock.isWorking;

  async function submit() {
    if (!data || busy.current) return;
    busy.current = true;
    setSubmitting(true);
    try {
      await clockWork(working ? 'CLOCK_OUT' : 'CLOCK_IN', note.trim());
      setNote('');
      toast(working ? '퇴근을 기록했어요. 수고 많았어요' : '출근을 기록했어요', 'success');
      await refresh();
    } catch (e) {
      toast(errorText(e, '근무 기록을 저장하지 못했어요'), 'error');
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  const footer = data ? (
    <Button
      block
      variant={working ? 'dark' : 'primary'}
      icon={working ? LogOut : LogIn}
      loading={submitting}
      onPress={() => void submit()}>
      {working ? '퇴근하기' : '출근하기'}
    </Button>
  ) : undefined;

  return (
    <Screen
      kind="push"
      title="출퇴근·급여"
      backFallback="/(staff)/(tabs)/menu"
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={footer}>
      {!data ? (
        error && !isLoading ? (
          <ErrorState message={error} onRetry={() => void retry()} />
        ) : (
          <Stack>
            <Section>
              <Stack gap={space.x4}>
                <View style={{ flexDirection: 'row', gap: space.x3, alignItems: 'center' }}>
                  <Skeleton style={{ width: 48, height: 48, borderRadius: 16 }} />
                  <View style={{ flex: 1, gap: space.x1_5 }}>
                    <Skeleton style={{ width: '50%', height: 20 }} />
                    <Skeleton style={{ width: '70%', height: 14 }} />
                  </View>
                </View>
                <Skeleton style={{ height: 52, borderRadius: 12 }} />
              </Stack>
            </Section>
            <ListSkeleton rows={2} />
          </Stack>
        )
      ) : (
        <Stack>
          <Section>
            <Stack gap={space.x5}>
              <View style={{ flexDirection: 'row', gap: space.x3_5, alignItems: 'center' }}>
                <IconTile icon={working ? LogIn : Clock3} tone={working ? 'ok' : 'gray'} solid={working} size={48} round />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="t7-bold">{working ? '근무 중이에요' : '퇴근 상태예요'}</Text>
                  <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x0_5 }}>
                    {data.clock.lastTag
                      ? `${data.clock.lastTag.type === 'CLOCK_IN' ? '출근' : '퇴근'} · ${kstDateTime(data.clock.lastTag.taggedAt)}`
                      : '아직 출퇴근 기록이 없어요'}
                  </Text>
                </View>
              </View>
              <TextField
                label="메모"
                indicator="선택"
                value={note}
                onChangeText={setNote}
                maxLength={500}
                placeholder="교대나 특이사항이 있으면 적어 주세요"
                returnKeyType="done"
              />
            </Stack>
          </Section>

          <Section title={`${data.month.month}월 정산`} description="입력된 근무 시간 기준 예상 세전 금액이에요">
            <InfoRow label="근무 시간">
              <Text variant="t5-bold" tabular>
                {formatMinutes(data.month.totalMinutes)}
              </Text>
            </InfoRow>
            <InfoRow label="예상 금액">
              <Text variant="t5-bold" tabular>
                {formatCurrency(data.month.totalWage)}
              </Text>
            </InfoRow>
            <InfoRow label="확인 상태">
              {data.month.ownerConfirmedAt ? (
                <Badge tone="ok" size="md">원장 확인 완료</Badge>
              ) : data.month.staffConfirmedAt ? (
                <Badge tone="info" size="md">원장 확인 대기</Badge>
              ) : (
                <Badge size="md">확인 전</Badge>
              )}
            </InfoRow>
          </Section>

          <Section title="최근 출퇴근" flush>
            {data.clock.recentTags.length === 0 ? (
              <EmptyState icon={History} title="최근 기록이 없어요" description="출근하면 여기에 쌓여요" />
            ) : (
              data.clock.recentTags.map((tag) => {
                const isIn = tag.type === 'CLOCK_IN';
                return (
                  <ListRow
                    key={tag.id}
                    align="start"
                    leading={<IconTile icon={isIn ? LogIn : LogOut} tone={isIn ? 'ok' : 'gray'} />}
                    title={isIn ? '출근' : '퇴근'}
                    description={
                      <View style={{ gap: space.x0_5 }}>
                        <Text variant="t4-regular" color="neutralSubtle" tabular>
                          {kstDateTime(tag.taggedAt)}
                        </Text>
                        {tag.note ? (
                          <Text variant="t4-regular" color="neutralMuted">
                            {tag.note}
                          </Text>
                        ) : null}
                      </View>
                    }
                  />
                );
              })
            )}
          </Section>
        </Stack>
      )}
    </Screen>
  );
}
