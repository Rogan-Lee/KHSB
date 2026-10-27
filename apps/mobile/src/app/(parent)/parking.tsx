import { Car, Users } from 'lucide-react-native';
import { Fragment, useRef, useState } from 'react';

import {
  Badge,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  Notice,
  Screen,
  Section,
  Skeleton,
  space,
  Stack,
  TextField,
  toast,
  type Tone,
} from '@/design';
import { useChildQuery } from '@/features/parent/child-query';
import {
  parentParkingPath,
  registerParking,
  type ParentParkingResponse,
  type ParkingStatus,
} from '@/lib/api/parent-parking';
import { ChildChips, useParentChild } from '@/lib/parent-child';
import { useResponsive } from '@/lib/responsive';

const BACK_FALLBACK = '/(parent)/(tabs)/menu';

const STATUS: Record<ParkingStatus, { label: string; tone: Tone }> = {
  OK: { label: '등록 완료', tone: 'ok' },
  PENDING: { label: '처리 중', tone: 'info' },
  FAILED: { label: '실패', tone: 'bad' },
  BLOCKED: { label: '한도 초과', tone: 'warn' },
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });

/**
 * 학부모 주차 등록 — 차량번호를 넣으면 서버가 주차장 웹할인 사이트에 할인을 적용한다.
 * 한도·의심 감지는 서버가 하고, 화면은 결과와 오늘 등록 내역만 보여 준다.
 */
export default function ParentParkingScreen() {
  const { selected } = useParentChild();
  const { isTablet } = useResponsive();
  if (!selected) {
    return (
      <Screen kind="push" title="주차 등록" backFallback={BACK_FALLBACK} maxWidth={isTablet ? 640 : undefined}>
        <EmptyState icon={Users} title="연결된 자녀가 없어요" description="자녀를 먼저 연결해 주세요." />
      </Screen>
    );
  }
  return <ChildParking key={selected.id} childId={selected.id} />;
}

function ChildParking({ childId }: { childId: string }) {
  const { isTablet } = useResponsive();
  const q = useChildQuery<ParentParkingResponse>(parentParkingPath(childId), childId);
  const data = q.isLoading ? null : q.data;
  // 직접 고치기 전까지는 지난번에 등록한 번호를 보여 준다
  const [typed, setTyped] = useState<string | null>(null);
  const carNo = typed ?? data?.lastCarNo ?? '';
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const full = data != null && data.todayCount >= data.dailyLimit;

  const submit = async () => {
    if (lock.current || !carNo.trim()) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await registerParking(childId, carNo);
      toast(result.message, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '주차 등록을 하지 못했어요.', 'error');
    } finally {
      lock.current = false;
      setBusy(false);
      void q.refresh();
    }
  };

  let body;
  if (!data) {
    body = q.error ? <ErrorState message={q.error} onRetry={q.retry} /> : <Skeleton style={{ height: 160 }} />;
  } else if (!data.enabled) {
    body = <EmptyState icon={Car} title="지금은 주차 등록을 할 수 없어요" description={data.guide} />;
  } else {
    body = (
      <>
        <Section>
          <TextField
            label="차량번호"
            placeholder="12가3456"
            value={carNo}
            onChangeText={setTyped}
            maxLength={12}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            description={data.guide}
          />
        </Section>
        {full && (
          <Notice tone="warn" icon={Car}>
            오늘은 {data.dailyLimit}번 모두 등록했어요. 내일 다시 등록할 수 있어요.
          </Notice>
        )}
        {data.today.length > 0 && (
          <Section title="오늘 등록" flush>
            {data.today.map((r, i) => (
              <Fragment key={r.id}>
                {i > 0 && <Divider inset={space.x5} />}
                <ListRow
                  title={r.carNo}
                  description={r.message ? `${timeOf(r.createdAt)} · ${r.message}` : timeOf(r.createdAt)}
                  trailing={<Badge tone={STATUS[r.status]?.tone ?? 'gray'}>{STATUS[r.status]?.label ?? r.status}</Badge>}
                  chevron={false}
                />
              </Fragment>
            ))}
          </Section>
        )}
      </>
    );
  }

  return (
    <Screen
      kind="push"
      title="주차 등록"
      backFallback={BACK_FALLBACK}
      refreshing={q.isRefreshing}
      onRefresh={() => void q.refresh()}
      maxWidth={isTablet ? 640 : undefined}
      footer={
        data?.enabled ? (
          <Button size="xl" block loading={busy} disabled={full || !carNo.trim()} onPress={() => void submit()}>
            {data ? `주차 등록하기 (${data.todayCount}/${data.dailyLimit})` : '주차 등록하기'}
          </Button>
        ) : undefined
      }>
      <Stack>
        <ChildChips />
        {body}
      </Stack>
    </Screen>
  );
}
