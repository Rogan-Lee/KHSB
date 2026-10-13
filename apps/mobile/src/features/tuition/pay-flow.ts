// 수강료 결제 흐름의 판단 로직 — 화면 배선(use-tuition-actions.ts)에서 떼어 낸 순수 함수.
// RN·Expo·'@/' 별칭을 import 하지 않는다: 루트 vitest 가 상대 경로로 가져다 테스트한다
// (src/lib/__tests__/mobile-tuition-banner.test.ts).

// ─── 서버가 거절했을 때 (HTTP 200 + ok:false) ─────────────────────────

/**
 * 화면이 서버와 어긋나 있다는 뜻의 코드 — 안내한 뒤 화면을 다시 불러온다.
 * (다른 보호자가 먼저 결제·신청했거나, 청구가 취소됐거나, 온라인 결제가 꺼진 경우)
 */
const STALE_SCREEN_CODES = new Set([
  'ALREADY_PAID',
  'INVOICE_NOT_PAYABLE',
  'NOT_FOUND',
  'ONSITE_REQUEST_EXISTS',
  'ONLINE_DISABLED',
]);

export function isStaleScreenCode(code: string | null | undefined): boolean {
  return !!code && STALE_SCREEN_CODES.has(code);
}

export type FailurePlan = { message: string; tone: 'success' | 'error'; refresh: boolean };

const CHECKOUT_FALLBACK = '결제를 시작하지 못했어요. 잠시 후 다시 시도해 주세요';

/**
 * "결제하기" 를 서버가 거절했을 때 보여 줄 안내.
 * 결제사 오류(PROVIDER_*)·처리 중(BUSY)처럼 다시 누르면 될 수 있는 것은 화면을 그대로 둔다.
 */
export function checkoutFailurePlan(
  code: string | null | undefined,
  serverMessage: string | null | undefined,
): FailurePlan {
  if (code === 'ALREADY_PAID') {
    return { message: '이미 납부된 수강료예요', tone: 'success', refresh: true };
  }
  if (code === 'ONSITE_REQUEST_EXISTS') {
    return { message: '현장 결제 신청을 철회한 뒤 결제해 주세요', tone: 'error', refresh: true };
  }
  return {
    message: serverMessage?.trim() || CHECKOUT_FALLBACK,
    tone: 'error',
    refresh: isStaleScreenCode(code),
  };
}

// ─── 결제 페이지에서 돌아온 뒤 확인 ───────────────────────────────────

const PAID_STATUSES = new Set(['PAID', 'PARTIALLY_REFUNDED']);

/**
 * 결제 확인(sync) 응답이 "납부됐다" 는 뜻인지.
 * 서버의 settled 는 "더 결제할 게 없다" 라서 청구 취소·전액 환불도 true 다 — 그때 결제 완료라고 알리면 안 된다.
 */
export function isPaidSync(res: { settled?: boolean | null; status?: string | null } | null | undefined): boolean {
  if (!res || res.settled !== true) return false;
  return res.status == null || PAID_STATUSES.has(res.status);
}

/** 다시 불러온 화면 데이터에서 본 그 청구서의 상태 */
export type InvoiceCheckState = 'open' | 'deposit' | 'settled' | 'gone';

type InvoiceLike = {
  id: string;
  status?: string;
  linkPending?: { deposit?: unknown } | null;
};

/**
 *  · open    — 아직 결제 대기
 *  · deposit — 가상계좌 입금 대기 (입금 안내를 보여 주면 되므로 더 기다리지 않는다)
 *  · settled — 납부 내역으로 넘어감
 *  · gone    — 목록에 없음 (청구 취소 등)
 */
export function invoiceCheckState(
  data: { open?: InvoiceLike[] | null; history?: InvoiceLike[] | null } | null | undefined,
  invoiceId: string,
): InvoiceCheckState | null {
  if (!data) return null;
  const open = (data.open ?? []).find((inv) => inv.id === invoiceId);
  if (open) return open.linkPending?.deposit ? 'deposit' : 'open';
  const past = (data.history ?? []).find((inv) => inv.id === invoiceId);
  if (past?.status != null && PAID_STATUSES.has(past.status)) return 'settled';
  return 'gone';
}

export const CHECK_INTERVAL_MS = 2500;
export const CHECK_MAX_POLLS = 8;

export type PaymentCheckResult = 'settled' | 'deposit' | 'pending' | 'gone' | 'cancelled';

export type PaymentCheckDeps = {
  /** 결제사 상태를 서버에 반영하고 납부 여부(isPaidSync)를 돌려준다. 거절·오류는 null (throw 해도 된다) */
  sync: () => Promise<boolean | null>;
  /** 화면 데이터를 다시 불러와 본 청구서 상태. 오류는 null (throw 해도 된다) */
  reload: () => Promise<InvoiceCheckState | null>;
  wait: (ms: number) => Promise<void>;
  /** 화면을 떠났거나 자녀를 바꿨으면 true — 그 뒤로는 아무 요청도 하지 않는다 */
  isCancelled: () => boolean;
};

/**
 * 결제 페이지에서 돌아온 직후의 확인. 결제사 반영이 몇 초 늦을 수 있어서
 * 한 번 확인한 뒤에도 간격을 두고 최대 maxPolls 번 더 본다.
 *
 * 네트워크 오류는 "아직 모름" 으로 보고 계속 본다 (브라우저에서 막 돌아온 직후엔 연결이 불안정할 수 있다).
 * 끝까지 미납이면 'pending' — 사용자가 결제 페이지를 그냥 닫았을 수 있으니 오류로 다루지 않는다.
 */
export async function runPaymentCheck(
  deps: PaymentCheckDeps,
  options: { intervalMs?: number; maxPolls?: number } = {},
): Promise<PaymentCheckResult> {
  const intervalMs = options.intervalMs ?? CHECK_INTERVAL_MS;
  const maxPolls = options.maxPolls ?? CHECK_MAX_POLLS;

  for (let attempt = 0; attempt <= maxPolls; attempt += 1) {
    if (attempt > 0) await deps.wait(intervalMs);
    if (deps.isCancelled()) return 'cancelled';

    const settled = await orNull(deps.sync);
    if (deps.isCancelled()) return 'cancelled';
    if (settled === true) return 'settled';

    const state = await orNull(deps.reload);
    if (deps.isCancelled()) return 'cancelled';
    if (state === 'settled') return 'settled';
    if (state === 'deposit') return 'deposit';
    if (state === 'gone') return 'gone';
  }
  return 'pending';
}

async function orNull<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
