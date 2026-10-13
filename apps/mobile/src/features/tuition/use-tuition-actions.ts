import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { confirm, toast } from '@/design';
import {
  fetchParentTuition,
  requestTuitionOnsite,
  startTuitionCheckout,
  syncTuitionInvoice,
  withdrawTuitionOnsite,
  type OnsiteRequestMethod,
  type ParentTuitionInvoice,
} from '@/lib/api/parent-tuition';
import { refreshBadges } from '@/lib/badges';
import { MobileApiError } from '@/lib/mobile-api';

import { ONSITE_METHOD_LABEL, won } from './format';
import { openPayPage } from './open-page';
import { checkoutFailurePlan, invoiceCheckState, isPaidSync, isStaleScreenCode, runPaymentCheck } from './pay-flow';

export type TuitionBusy = { kind: 'checkout' | 'onsite' | 'withdraw'; invoiceId: string } | null;

type CheckToken = {
  cancelled: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  wake: (() => void) | null;
};

/** 서버가 준 한국어 문구만 그대로 보여 준다 (fetch 자체가 실패하면 영문 TypeError 라서 바꿔 준다) */
function apiErrorMessage(e: unknown) {
  return e instanceof MobileApiError && e.message ? e.message : '네트워크 연결을 확인해 주세요';
}

/**
 * 수강료 화면의 결제·현장 결제 신청 동작.
 *
 * 결제하기: 링크 발급 → 브라우저 → 돌아오면 결제 확인(runPaymentCheck) 한 번.
 *  · iOS 는 앱 안 브라우저 시트가 닫힐 때, Android·웹은 앱이 다시 활성화될 때 확인한다.
 *  · 확인은 동시에 하나만 돌고, 화면을 떠나면 멈춘다.
 * 이 훅을 쓰는 컴포넌트는 자녀별로 key 를 줘서 자녀가 바뀌면 다시 마운트되게 한다
 * (앞 자녀의 요청 결과·결제 확인이 다른 자녀 화면에 섞이지 않게).
 */
export function useTuitionActions({
  studentId,
  refresh,
}: {
  studentId: string;
  /** 화면 조회를 다시 불러온다 (useChildQuery.refresh) */
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<TuitionBusy>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const alive = useRef(true);
  // 연타 방지 — state 는 다음 렌더에야 바뀌어서 같은 프레임의 두 번째 탭을 못 막는다
  const lock = useRef(false);
  const check = useRef<CheckToken | null>(null);
  // 결제 페이지를 앱 밖에 열어 둔 청구서 — 앱으로 돌아오면 한 번 확인한다
  const awaiting = useRef<string | null>(null);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  const beginCheck = (invoiceId: string): CheckToken => {
    const token: CheckToken = { cancelled: false, timer: null, wake: null };
    check.current = token;
    setCheckingId(invoiceId);
    return token;
  };

  const endCheck = (token: CheckToken) => {
    if (check.current === token) check.current = null;
    if (!token.cancelled) setCheckingId(null);
  };

  /** 결제 페이지에서 돌아온 뒤의 확인 — 납부됐으면 알리고, 아니면 조용히 끝낸다 */
  const runCheck = async (invoiceId: string) => {
    if (check.current) return;
    const token = beginCheck(invoiceId);
    try {
      const result = await runPaymentCheck({
        sync: async () => {
          const res = await syncTuitionInvoice(studentId, invoiceId);
          return res.ok ? isPaidSync(res) : null;
        },
        reload: async () => invoiceCheckState(await fetchParentTuition(studentId), invoiceId),
        wait: (ms) =>
          new Promise<void>((resolve) => {
            token.wake = resolve;
            token.timer = setTimeout(resolve, ms);
          }),
        isCancelled: () => token.cancelled,
      });
      if (result === 'cancelled') return;
      await refreshRef.current();
      if (token.cancelled) return;
      // 입금 대기는 화면의 안내가 설명하고, 끝까지 미납이면 결제 페이지를 그냥 닫았을 수 있어 알리지 않는다
      if (result === 'settled') {
        toast('결제가 완료됐어요', 'success');
        refreshBadges();
      }
    } finally {
      endCheck(token);
    }
  };

  const runCheckRef = useRef(runCheck);
  useEffect(() => {
    runCheckRef.current = runCheck;
  });

  useEffect(() => {
    alive.current = true;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const invoiceId = awaiting.current;
      if (!invoiceId) return;
      awaiting.current = null;
      void runCheckRef.current(invoiceId);
    });
    return () => {
      alive.current = false;
      awaiting.current = null;
      sub.remove();
      const token = check.current;
      if (token) {
        token.cancelled = true;
        if (token.timer) clearTimeout(token.timer);
        token.wake?.();
        check.current = null;
      }
    };
  }, []);

  const pay = async (invoice: ParentTuitionInvoice) => {
    if (lock.current || check.current) return;
    lock.current = true;
    setBusy({ kind: 'checkout', invoiceId: invoice.id });
    try {
      let res;
      try {
        res = await startTuitionCheckout(studentId, invoice.id);
      } catch (e) {
        if (alive.current) toast(apiErrorMessage(e), 'error');
        return;
      }
      if (!alive.current) return;
      if (!res.ok) {
        const plan = checkoutFailurePlan(res.code, res.message);
        toast(plan.message, plan.tone);
        if (plan.refresh) {
          refreshBadges();
          await refreshRef.current();
        }
        return;
      }

      // Android·웹은 페이지를 열자마자 앱이 뒤로 가므로, 열기 전에 "돌아오면 확인" 을 걸어 둔다.
      // iOS 는 시트가 닫혀야 아래 await 가 끝난다. 그 사이 카드사 앱을 다녀오는 앱 전환으로
      // 확인이 먼저 돌아 버리지 않게, iOS 에서는 걸어 두지 않는다.
      if (Platform.OS !== 'ios') awaiting.current = invoice.id;
      const opened = await openPayPage(res.payUrl);
      if (!alive.current) return;
      if (opened === 'failed') {
        awaiting.current = null;
        toast('결제 페이지를 열지 못했어요', 'error');
        return;
      }
      if (opened === 'closed') {
        awaiting.current = null;
        void runCheck(invoice.id);
        return;
      }
      // 앱 밖에서 열림 (iOS 가 기본 브라우저로 넘어간 경우 포함) → AppState 리스너가 확인한다
      awaiting.current = invoice.id;
      // 돌아왔다는 신호가 오지 않는 환경(웹의 새 창 등)에서도 "결제 확인" 안내가 보이도록 화면을 한 번 갱신해 둔다
      void refreshRef.current();
    } finally {
      lock.current = false;
      if (alive.current) setBusy(null);
    }
  };

  /** "결제 확인" 버튼 — 한 번만 물어보고 결과를 바로 알려 준다 */
  const confirmPayment = async (invoice: ParentTuitionInvoice) => {
    if (lock.current || check.current) return;
    const token = beginCheck(invoice.id);
    try {
      const res = await syncTuitionInvoice(studentId, invoice.id);
      if (token.cancelled) return;
      await refreshRef.current();
      if (token.cancelled) return;
      if (!res.ok) {
        toast(res.message || '결제를 확인하지 못했어요. 잠시 후 다시 시도해 주세요', 'error');
      } else if (isPaidSync(res)) {
        toast('결제가 완료됐어요', 'success');
        refreshBadges();
      } else if (res.settled) {
        // 청구 취소·환불 — 방금 다시 불러온 화면이 바뀐 상태를 보여 준다
        toast('청구서 상태가 바뀌었어요. 내역을 확인해 주세요');
      } else {
        toast('아직 결제가 확인되지 않았어요');
      }
    } catch (e) {
      if (!token.cancelled) toast(apiErrorMessage(e), 'error');
    } finally {
      endCheck(token);
    }
  };

  /** 현장 결제 신청 — 신청됐으면 true (시트를 닫는다) */
  const requestOnsite = async (invoice: ParentTuitionInvoice, method: OnsiteRequestMethod): Promise<boolean> => {
    if (lock.current || check.current) return false;
    lock.current = true;
    try {
      const ok = await confirm({
        title: `${ONSITE_METHOD_LABEL[method] ?? '현장 결제'}로 결제를 신청할까요?`,
        message: `독서실에서 ${won(invoice.amount)}을 결제하시면 운영진이 확인해 드려요. 신청은 언제든 철회할 수 있어요.`,
        confirmText: '신청하기',
      });
      if (!ok || !alive.current) return false;
      setBusy({ kind: 'onsite', invoiceId: invoice.id });
      const res = await requestTuitionOnsite(studentId, invoice.id, method);
      if (!alive.current) return false;
      if (!res.ok) {
        toast(res.message || '신청하지 못했어요. 잠시 후 다시 시도해 주세요', 'error');
        if (isStaleScreenCode(res.code)) await refreshRef.current();
        return false;
      }
      toast('현장 결제를 신청했어요', 'success');
      refreshBadges();
      await refreshRef.current();
      return true;
    } catch (e) {
      if (alive.current) toast(apiErrorMessage(e), 'error');
      return false;
    } finally {
      lock.current = false;
      if (alive.current) setBusy(null);
    }
  };

  const withdrawOnsite = async (invoice: ParentTuitionInvoice) => {
    const request = invoice.onsiteRequest;
    if (!request || lock.current || check.current) return;
    lock.current = true;
    try {
      const ok = await confirm({
        title: '현장 결제 신청을 철회할까요?',
        message: '철회한 뒤에도 다시 신청할 수 있어요.',
        confirmText: '철회하기',
      });
      if (!ok || !alive.current) return;
      setBusy({ kind: 'withdraw', invoiceId: invoice.id });
      const res = await withdrawTuitionOnsite(studentId, request.paymentId);
      if (!alive.current) return;
      if (!res.ok) {
        toast(res.message || '철회하지 못했어요. 잠시 후 다시 시도해 주세요', 'error');
        if (isStaleScreenCode(res.code)) await refreshRef.current();
        return;
      }
      toast('현장 결제 신청을 철회했어요', 'success');
      refreshBadges();
      await refreshRef.current();
    } catch (e) {
      if (alive.current) toast(apiErrorMessage(e), 'error');
    } finally {
      lock.current = false;
      if (alive.current) setBusy(null);
    }
  };

  return {
    /** 진행 중인 요청 (버튼 로딩 표시용) */
    busy,
    /** 결제 확인 중인 청구서 id */
    checkingId,
    /** 무엇이든 진행 중 — 다른 동작 버튼을 잠근다 */
    locked: busy !== null || checkingId !== null,
    pay,
    confirmPayment,
    requestOnsite,
    withdrawOnsite,
  };
}
