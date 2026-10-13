"use client";

// 청구서 링크 화면 — 청구 내용 · 결제하기 · 현장 결제 신청 · 납부 확인.
// 학부모 앱의 수강료 화면(apps/mobile/src/app/(parent)/tuition.tsx)과 같은 흐름·문구를 쓴다.
//
// 결제창은 같은 탭에서 연다. 카카오톡 안 브라우저는 새 창을 막는 일이 많고, 결제사는 결제가 끝나도
// 이 화면으로 돌려보내지 않는다. 그래서 이 화면으로 돌아왔을 때(뒤로 가기·다시 열기)마다 결제를 확인한다.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Info,
  Landmark,
  Smartphone,
  Store,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { requestBillOnsite, startBillCheckout, syncBill, withdrawBillOnsite } from "@/actions/tuition-bill";
import { BottomSheet } from "@/components/portal/bottom-sheet";
import { Badge, BottomCTA, Button, IconTile, InfoRow, Notice, Section, type Tone } from "@/components/portal/ui";
import type { BillView } from "@/lib/tuition/bill-link";
import { dotDate, INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, periodLabel, won } from "@/lib/tuition/format";
import type { OnsiteRequestMethod, TuitionResult } from "@/lib/tuition/types";

export type BillScreenView = Omit<
  BillView,
  "invoiceId" | "studentId" | "appLink" | "appIntentLink" | "guideText" | "onsiteGuideText"
>;

type Busy = "pay" | "onsite" | "withdraw" | "check" | null;

/** 돌아올 때마다 확인하되, 화면 전환이 잦아도 결제사 조회가 몰리지 않게 간격을 둔다 */
const AUTO_CHECK_GAP_MS = 5_000;

const ONSITE_OPTIONS: { method: OnsiteRequestMethod; label: string; description: string; icon: LucideIcon; tone: Tone }[] =
  [
    {
      method: "LOCAL_CURRENCY",
      label: "지역화폐",
      description: "지역화폐 카드·앱으로 독서실에서 결제",
      icon: WalletCards,
      tone: "ok",
    },
    {
      method: "ONSITE_CARD",
      label: "현장 카드",
      description: "독서실 단말기에서 카드로 결제",
      icon: CreditCard,
      tone: "info",
    },
  ];

const ONSITE_LABEL: Record<OnsiteRequestMethod, string> = { LOCAL_CURRENCY: "지역화폐", ONSITE_CARD: "현장 카드" };

/** 서버 액션 호출 — 연결이 끊기면 throw 로 오므로 화면이 한 가지 형태만 다루게 결과로 바꾼다 */
async function call<T>(action: () => Promise<TuitionResult<T>>): Promise<TuitionResult<T>> {
  try {
    return await action();
  } catch {
    return { ok: false, code: "INTERNAL", error: "처리하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요" };
  }
}

function dueMeta(daysToDue: number): { label: string; tone: Tone } {
  if (daysToDue < 0) return { label: `${-daysToDue}일 지남`, tone: "bad" };
  if (daysToDue === 0) return { label: "오늘까지", tone: "warn" };
  return { label: `D-${daysToDue}`, tone: daysToDue <= 3 ? "warn" : "gray" };
}

function dateTimeLabel(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("복사하지 못했어요. 길게 눌러 직접 복사해 주세요");
  }
}

export function BillScreen({
  token,
  bill,
  appHref,
  appMissing,
  guide,
  onsiteGuide,
}: {
  token: string;
  bill: BillScreenView;
  /** 앱의 수강료 화면 주소 (기기에 맞춰 서버가 고른다) */
  appHref: string;
  /** 앱으로 넘어가려 했지만 앱이 없어 되돌아온 경우 */
  appMissing: boolean;
  /** 운영진이 적어 둔 수강료 안내 (서버에서 그린 마크다운) */
  guide: ReactNode;
  onsiteGuide: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const open = bill.status === "REQUESTED" || bill.status === "OVERDUE";
  const canAct = open && !bill.onsiteRequest;
  const pending = open && bill.linkPending != null;
  const deposit = bill.linkPending?.deposit ?? null;

  // 결제창을 열어 둔 상태인지 — 화면에 돌아왔을 때 결제를 확인할지 정한다
  const awaitingRef = useRef(pending);
  const lastCheckRef = useRef(0);
  useEffect(() => {
    awaitingRef.current = pending || awaitingRef.current;
  }, [pending]);

  /** 결제사에 다시 물어 반영하고 화면을 새로 그린다. 납부가 확인됐으면 true */
  const syncNow = useCallback(async (): Promise<TuitionResult<{ paid: boolean }>> => {
    lastCheckRef.current = Date.now();
    const result = await call(() => syncBill(token));
    router.refresh();
    return result.ok ? { ok: true, data: { paid: result.data.paid } } : result;
  }, [router, token]);

  useEffect(() => {
    if (!open) return;
    const autoCheck = () => {
      if (document.visibilityState !== "visible" || !awaitingRef.current) return;
      if (Date.now() - lastCheckRef.current < AUTO_CHECK_GAP_MS) return;
      void syncNow();
    };
    // 뒤로 가기로 돌아오면 이전 화면이 그대로 복원된다 — 눌러 둔 버튼 상태를 풀고 결제를 확인한다
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(null);
      autoCheck();
    };
    autoCheck();
    document.addEventListener("visibilitychange", autoCheck);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", autoCheck);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [open, syncNow]);

  async function pay() {
    setBusy("pay");
    const result = await call(() => startBillCheckout(token));
    if (!result.ok) {
      setBusy(null);
      toast.error(result.error);
      // 그 사이 다른 보호자가 결제했거나 청구가 취소됐을 수 있다
      router.refresh();
      return;
    }
    awaitingRef.current = true;
    window.location.assign(result.data.payUrl);
  }

  async function confirmPayment() {
    setBusy("check");
    const result = await syncNow();
    setBusy(null);
    if (!result.ok) toast.error(result.error);
    else if (result.data.paid) toast.success("납부가 확인됐어요");
    else toast("아직 결제가 확인되지 않았어요", { description: "결제를 마쳤다면 잠시 후 다시 확인해 주세요." });
  }

  async function requestOnsite(method: OnsiteRequestMethod) {
    setBusy("onsite");
    const result = await call(() => requestBillOnsite(token, method));
    setBusy(null);
    router.refresh();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSheetOpen(false);
    toast.success(`${ONSITE_LABEL[method]} 결제를 신청했어요`);
  }

  async function withdrawOnsite() {
    setBusy("withdraw");
    const result = await call(() => withdrawBillOnsite(token));
    setBusy(null);
    router.refresh();
    if (!result.ok) toast.error(result.error);
    else toast.success("신청을 철회했어요");
  }

  const locked = busy !== null;
  // 온라인 결제를 받을 때는 하단 버튼이 두 줄(결제하기 + 현장 결제 신청)이다
  const twoRows = bill.onlinePaymentEnabled;
  const due = dueMeta(bill.daysToDue);
  const hasBreakdown = bill.extraItems.length > 0 || bill.discount > 0 || bill.tax != null;

  let state: ReactNode = null;
  if (bill.onsiteRequest && open) {
    state = (
      <>
        <Notice tone="info" icon={Store} title="현장 결제를 신청했어요">
          독서실에서 {ONSITE_LABEL[bill.onsiteRequest.method]}로 결제하시면 확인해 드려요.
        </Notice>
        {onsiteGuide != null && <div className="rounded-r4 bg-bg-layer-fill p-x4">{onsiteGuide}</div>}
        <Button variant="gray" size="md" loading={busy === "withdraw"} disabled={locked} onClick={() => void withdrawOnsite()}>
          신청 철회
        </Button>
      </>
    );
  } else if (open && deposit) {
    state = (
      <>
        <Notice tone="warn" icon={Clock} title="입금을 기다리고 있어요">
          {deposit.accountNumber ? "아래 계좌로 입금하시면 자동으로 확인돼요." : "입금이 확인되면 납부 완료로 바뀌어요."}
        </Notice>
        {deposit.accountNumber && (
          <div className="flex items-center gap-x3 rounded-r4 bg-bg-layer-fill py-x3_5 pl-x4 pr-x3">
            <IconTile icon={Landmark} tone="brand" size={40} round />
            <div className="min-w-0 flex-1">
              <p className="truncate t3-regular text-fg-neutral-subtle">{deposit.bank || "입금 계좌"}</p>
              <p className="break-all t6-bold tabular-nums text-fg-neutral">{deposit.accountNumber}</p>
            </div>
            <Button
              variant="weak"
              size="sm"
              aria-label="계좌번호 복사"
              onClick={() => void copy(deposit.accountNumber ?? "", "계좌번호를 복사했어요")}
            >
              <Copy className="h-4 w-4" strokeWidth={2.2} />
              복사
            </Button>
          </div>
        )}
        {deposit.dueAt && <InfoRow label="입금 기한">{dateTimeLabel(deposit.dueAt)}까지</InfoRow>}
        <Button variant="gray" size="md" loading={busy === "check"} disabled={locked} onClick={() => void confirmPayment()}>
          입금 확인
        </Button>
      </>
    );
  } else if (pending) {
    state = (
      <>
        <Notice tone="gray" icon={Info}>
          결제를 완료하셨다면 잠시 후 반영돼요.
        </Notice>
        <Button variant="gray" size="md" loading={busy === "check"} disabled={locked} onClick={() => void confirmPayment()}>
          결제 확인
        </Button>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-x3">
      <Section>
        <div className="flex items-start gap-x3">
          <h1 className="min-w-0 flex-1 t6-bold text-fg-neutral">{bill.title}</h1>
          <Badge tone={INVOICE_STATUS_TONE[bill.status]} size="md">
            {INVOICE_STATUS_LABEL[bill.status]}
          </Badge>
        </div>
        <p className="mt-x1 t10-bold tabular-nums text-fg-neutral">{won(bill.amount)}</p>

        <div className="mt-x4 border-t border-stroke-neutral-subtle pt-x2">
          <InfoRow label="이용 기간">
            <span className="tabular-nums">{periodLabel(bill.periodStart, bill.periodEnd)}</span>
            {bill.months > 1 && (
              <span className="block t4-regular text-fg-neutral-subtle">{bill.months}개월</span>
            )}
          </InfoRow>
          {open && (
            <InfoRow label="납부 기한">
              <span className="inline-flex flex-wrap items-center justify-end gap-x1_5">
                <span className="tabular-nums">{dotDate(bill.dueDate)}</span>
                <Badge tone={due.tone}>{due.label}</Badge>
              </span>
            </InfoRow>
          )}
        </div>

        {hasBreakdown && (
          <div className="mt-x2 border-t border-stroke-neutral-subtle pt-x2">
            <InfoRow
              label={
                bill.months > 1 ? `수강료 (월 ${won(bill.monthlyFee)} × ${bill.months}개월)` : "수강료"
              }
            >
              <span className="tabular-nums">{won(bill.tuitionAmount)}</span>
            </InfoRow>
            {bill.extraItems.map((item, index) => (
              <InfoRow key={`${item.name}-${index}`} label={item.name}>
                <span className="tabular-nums">{won(item.amount)}</span>
              </InfoRow>
            ))}
            {bill.discount > 0 && (
              <InfoRow label="할인">
                <span className="tabular-nums">−{won(bill.discount)}</span>
              </InfoRow>
            )}
            {bill.tax && (
              <InfoRow label="공급가액 · 부가세">
                <span className="tabular-nums">
                  {won(bill.tax.supplyAmount)} · {won(bill.tax.taxAmount)}
                </span>
              </InfoRow>
            )}
          </div>
        )}

        {bill.parentMessage && (
          <p className="mt-x3 whitespace-pre-line rounded-r4 bg-bg-layer-fill p-x4 t4-regular text-fg-neutral-muted">
            {bill.parentMessage}
          </p>
        )}

        {state != null && <div className="mt-x3 flex flex-col items-start gap-x2_5">{state}</div>}
      </Section>

      {!open && <ClosedState bill={bill} />}

      {canAct && !bill.onlinePaymentEnabled && (
        <Notice tone="gray" icon={Store}>
          지금은 현장 결제만 받고 있어요. 독서실에서 결제해 주세요.
        </Notice>
      )}

      {guide != null && <Section title="수강료 안내">{guide}</Section>}

      <Section flush>
        <a
          href={appHref}
          className="mx-x2 flex items-center gap-x3 rounded-r4 px-x3 py-x3 transition-colors duration-color-transition active:bg-bg-transparent-pressed"
        >
          <IconTile icon={Smartphone} tone="brand" size={40} round />
          <span className="flex min-w-0 flex-1 flex-col gap-x0_5">
            <span className="t5-medium text-fg-neutral">강한선배 앱에서 보기</span>
            <span className="t4-regular text-fg-neutral-subtle">
              {appMissing
                ? "앱이 설치되어 있지 않아요. 이 화면에서 바로 결제할 수 있어요."
                : "앱을 쓰고 계시면 납부 내역과 다음 결제 안내까지 볼 수 있어요."}
            </span>
          </span>
          <ChevronRight className="h-[18px] w-[18px] shrink-0 text-fg-neutral-subtle" strokeWidth={2} aria-hidden />
        </a>
      </Section>

      {/* 하단 버튼은 시트보다 위에 떠 있어서, 시트를 연 동안에는 자리만 남기고 내린다 (앱과 같은 배치: 결제하기 아래에 현장 결제 신청) */}
      {canAct &&
        (sheetOpen ? (
          <div aria-hidden className={twoRows ? "h-[140px]" : "h-[92px]"} />
        ) : (
          <>
            {twoRows && <div aria-hidden className="h-x12" />}
            <BottomCTA>
              {bill.onlinePaymentEnabled ? (
                <div className="flex w-full flex-col gap-x1">
                  <Button size="xl" block loading={busy === "pay"} disabled={locked} onClick={() => void pay()}>
                    {pending ? "결제 이어서 하기" : "결제하기"}
                  </Button>
                  <Button variant="ghost" size="md" block disabled={locked} onClick={() => setSheetOpen(true)}>
                    지역화폐로 결제 신청
                  </Button>
                </div>
              ) : (
                <Button size="xl" block disabled={locked} onClick={() => setSheetOpen(true)}>
                  현장 결제 신청하기
                </Button>
              )}
            </BottomCTA>
          </>
        ))}

      <BottomSheet
        open={sheetOpen && canAct}
        onOpenChange={(next) => {
          if (busy !== "onsite") setSheetOpen(next);
        }}
        title="현장 결제 신청"
        description="독서실에서 결제하실 방법을 골라 주세요. 신청해 두면 결제하신 뒤 운영진이 확인해 드려요."
        footer={
          <Button variant="gray" size="xl" block disabled={busy === "onsite"} onClick={() => setSheetOpen(false)}>
            닫기
          </Button>
        }
      >
        {onsiteGuide != null && <div className="mb-x2 rounded-r4 bg-bg-layer-fill p-x4">{onsiteGuide}</div>}
        <div className="-mx-x3">
          {ONSITE_OPTIONS.map((option) => (
            <button
              key={option.method}
              type="button"
              disabled={busy === "onsite"}
              onClick={() => void requestOnsite(option.method)}
              className="flex min-h-16 w-full items-center gap-x3 rounded-r4 px-x3 py-x2 text-left transition-colors duration-color-transition active:bg-bg-transparent-pressed disabled:opacity-50"
            >
              <IconTile icon={option.icon} tone={option.tone} size={44} round />
              <span className="flex min-w-0 flex-1 flex-col gap-x0_5">
                <span className="t5-bold text-fg-neutral">{option.label}</span>
                <span className="t4-regular text-fg-neutral-subtle">{option.description}</span>
              </span>
              <ChevronRight className="h-[18px] w-[18px] shrink-0 text-fg-neutral-subtle" strokeWidth={2} aria-hidden />
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}

/** 납부·환불·취소로 끝난 청구서 — 더 할 일이 없다는 것과 결과만 보여 준다 */
function ClosedState({ bill }: { bill: BillScreenView }) {
  if (bill.status === "CANCELED") {
    return (
      <Notice tone="gray" icon={Info} title="취소된 청구서예요">
        결제하실 필요가 없어요. 궁금한 점은 독서실로 문의해 주세요.
      </Notice>
    );
  }
  const refunded = bill.status === "REFUNDED";
  return (
    <Section>
      <div className="flex items-center gap-x3">
        <IconTile icon={CheckCircle2} tone={refunded ? "gray" : "ok"} size={44} round />
        <div className="min-w-0">
          <p className="t5-bold text-fg-neutral">{refunded ? "환불이 끝난 청구서예요" : "납부가 확인됐어요"}</p>
          <p className="mt-x0_5 t4-regular text-fg-neutral-subtle">
            {refunded ? "납부하신 금액을 모두 돌려 드렸어요." : "더 하실 일은 없어요. 감사합니다."}
          </p>
        </div>
      </div>
      <div className="mt-x3 border-t border-stroke-neutral-subtle pt-x2">
        {bill.paidAt && <InfoRow label="납부일">{dateLabel(bill.paidAt)}</InfoRow>}
        {bill.paidMethodLabel && <InfoRow label="결제 수단">{bill.paidMethodLabel}</InfoRow>}
        {bill.refundedAmount > 0 && (
          <InfoRow label="환불 금액">
            <span className="tabular-nums">{won(bill.refundedAmount)}</span>
          </InfoRow>
        )}
      </div>
    </Section>
  );
}
