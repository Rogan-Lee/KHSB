import { useLocalSearchParams } from 'expo-router';
import { Receipt, Store, Users } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Button, EmptyState, ErrorState, Notice, Screen, Section, space, Stack } from '@/design';
import { useChildQuery } from '@/features/parent/child-query';
import { OpenInvoiceCard } from '@/features/tuition/invoice-card';
import { OnsiteSheet } from '@/features/tuition/onsite-sheet';
import { NextPayment, TuitionGuide, TuitionHistory, TuitionSkeleton } from '@/features/tuition/sections';
import { useTuitionActions } from '@/features/tuition/use-tuition-actions';
import { parentTuitionPath, type ParentTuitionResponse } from '@/lib/api/parent-tuition';
import { ChildChips, useParentChild } from '@/lib/parent-child';
import { useResponsive } from '@/lib/responsive';

const BACK_FALLBACK = '/(parent)/(tabs)/menu';

/**
 * 학부모 수강료 — 결제할 청구서 · 수강료 안내 · 다음 결제 · 납부 내역.
 * 결제는 결제 링크를 앱 안 브라우저로 열어서 하고, 지역화폐·현장 카드는 신청만 해 두면
 * 독서실에서 결제한 뒤 운영진이 확인한다. 온라인 결제를 쓰지 않는 동안에는 현장 결제만 안내한다.
 */
export default function ParentTuitionScreen() {
  const { children: kids, selected, select } = useParentChild();
  const { isTablet } = useResponsive();

  // 청구서 링크(웹)에서 "앱에서 보기"로 넘어오면 주소에 자녀 id 가 실려 온다 — 그 자녀의 수강료를 보여 준다.
  // 연결된 자녀가 아닌 id 는 무시한다 (조회 권한은 어차피 서버가 자녀 연결로 확인한다).
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  const linkedId = typeof studentId === 'string' && kids.some((kid) => kid.id === studentId) ? studentId : null;
  useEffect(() => {
    if (linkedId) select(linkedId);
  }, [linkedId, select]);

  if (!selected) {
    return (
      <Screen kind="push" title="수강료" backFallback={BACK_FALLBACK} maxWidth={isTablet ? 640 : undefined}>
        <EmptyState icon={Users} title="연결된 자녀가 없어요" description="자녀를 먼저 연결해 주세요." />
      </Screen>
    );
  }
  // 자녀를 바꾸면 통째로 다시 마운트한다 — 앞 자녀의 결제 확인·요청 결과가 다른 자녀 화면에 섞이지 않게
  return <ChildTuition key={selected.id} childId={selected.id} />;
}

function ChildTuition({ childId }: { childId: string }) {
  const { isTablet } = useResponsive();
  const q = useChildQuery<ParentTuitionResponse>(parentTuitionPath(childId), childId);
  const actions = useTuitionActions({ studentId: childId, refresh: q.refresh });
  const [sheetOpen, setSheetOpen] = useState(false);

  const data = q.isLoading ? null : q.data;
  const open = data?.open ?? [];
  const history = data?.history ?? [];
  const online = data?.onlinePaymentEnabled === true;
  // 하단 버튼은 납부 기한이 가장 빠른 청구서 하나만 다룬다
  const first = open[0] ?? null;
  const canAct = first != null && !first.onsiteRequest;

  // 시트를 열어 둔 사이 더 신청할 수 없게 되면(다른 보호자가 먼저 결제·신청) 닫는다
  if (sheetOpen && !canAct) setSheetOpen(false);

  let footer: ReactNode;
  if (first && canAct) {
    const paying =
      (actions.busy?.kind === 'checkout' && actions.busy.invoiceId === first.id) || actions.checkingId === first.id;
    footer = (
      <View style={{ gap: space.x2 }}>
        {online && (
          <Button
            variant="primary"
            size="xl"
            block
            loading={paying}
            disabled={actions.locked}
            onPress={() => void actions.pay(first)}>
            {/* 청구서가 여러 장이면 어느 것을 결제하는지 버튼에 적는다 */}
            {open.length > 1 ? `${first.title} 결제하기` : '결제하기'}
          </Button>
        )}
        <Button
          variant={online ? 'ghost' : 'primary'}
          size={online ? 'md' : 'xl'}
          block
          disabled={actions.locked}
          onPress={() => setSheetOpen(true)}>
          {online ? '지역화폐로 결제 신청' : '현장 결제 신청하기'}
        </Button>
      </View>
    );
  }

  let body;
  if (!data) {
    body = q.error ? <ErrorState message={q.error} onRetry={q.retry} /> : <TuitionSkeleton />;
  } else {
    body = (
      <>
        {open.map((invoice, i) => (
          <OpenInvoiceCard
            key={invoice.id}
            invoice={invoice}
            checking={actions.checkingId === invoice.id}
            withdrawing={actions.busy?.kind === 'withdraw' && actions.busy.invoiceId === invoice.id}
            locked={actions.locked}
            hint={i > 0 ? '납부 기한이 빠른 수강료부터 결제할 수 있어요.' : undefined}
            onWithdraw={() => void actions.withdrawOnsite(invoice)}
            onConfirmPayment={() => void actions.confirmPayment(invoice)}
          />
        ))}
        {canAct && !online && (
          <Notice tone="gray" icon={Store}>
            지금은 현장 결제만 받고 있어요. 독서실에서 결제해 주세요.
          </Notice>
        )}
        {open.length === 0 && history.length === 0 && (
          <Section>
            <EmptyState
              icon={Receipt}
              title="아직 수강료 안내가 없어요"
              description="청구서가 나오면 알림으로 알려 드려요."
              style={{ paddingVertical: space.x8 }}
            />
          </Section>
        )}
        <TuitionGuide text={data.guideText} />
        <NextPayment next={data.nextPayment} />
        <TuitionHistory items={history} />
      </>
    );
  }

  return (
    <Screen
      kind="push"
      title="수강료"
      backFallback={BACK_FALLBACK}
      footer={footer}
      refreshing={q.isRefreshing}
      onRefresh={() => void q.refresh()}
      maxWidth={isTablet ? 640 : undefined}>
      <Stack>
        <ChildChips />
        {body}
      </Stack>
      <OnsiteSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        guideText={data?.onsiteGuideText}
        busy={actions.busy?.kind === 'onsite'}
        onChoose={(method) => {
          if (!first) return;
          void actions.requestOnsite(first, method).then((done) => {
            if (done) setSheetOpen(false);
          });
        }}
      />
    </Screen>
  );
}
