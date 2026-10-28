"use client";

// 수강료 어드민 화면의 뼈대 — 머리(달 이동·발행 버튼), 요약 카드, 탭.
// 탭마다 파일을 나눠 두었고, 청구서 상세 다이얼로그는 어느 탭에서든 열 수 있게 여기서 띄운다.

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, StatCard, StatCards } from "@/components/backoffice/ui";
import { useStickyState } from "@/hooks/use-sticky-state";
import { formatYearMonth, shiftMonth } from "@/lib/online/month";
import type { TuitionAdminData } from "@/lib/tuition/admin-data";
import { won } from "@/lib/tuition/format";
import { BillingTab } from "./billing-tab";
import { CashReceiptsTab } from "./cash-receipts-tab";
import { InvoiceDetailDialog } from "./invoice-detail-dialog";
import { InvoicesTab } from "./invoices-tab";
import { IssueDialog } from "./issue-dialog";
import { OnsiteTab } from "./onsite-tab";
import { RefundsTab } from "./refunds-tab";
import { SettingsTab } from "./settings-tab";

type Tab = "invoices" | "onsite" | "billing" | "refunds" | "cashReceipts" | "settings";

/** 금액 카드 — 다섯 칸으로 나뉘는 폭에서도 억 단위 숫자가 넘치지 않게 한 단계 작은 글자를 쓴다 */
function Money({ value }: { value: number }) {
  return <span className="t8-bold">{value.toLocaleString("ko-KR")}</span>;
}

export function TuitionAdmin({ data, fullAccess }: { data: TuitionAdminData; fullAccess: boolean }) {
  const { ym, kpi, counts } = data;
  const [storedTab, setTab] = useStickyState<Tab>("tuition-admin:tab", "invoices");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);

  // 청구 예정·설정은 원장급에게만 탭 자체를 만들지 않는다 (데이터도 내려오지 않는다)
  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "invoices", label: "청구·수납" },
    { key: "onsite", label: "현장 결제", badge: counts.onsiteRequests },
    ...(fullAccess ? [{ key: "billing" as const, label: "청구 예정", badge: data.billingTargets.length }] : []),
    { key: "refunds", label: "환불", badge: data.refunds.filter((refund) => refund.unresolved).length },
    { key: "cashReceipts", label: "현금영수증", badge: counts.cashReceiptTodo },
    ...(fullAccess ? [{ key: "settings" as const, label: "설정" }] : []),
  ];
  // 저장해 둔 탭이 지금 권한으로는 없는 탭일 수 있다 (원장 계정으로 보다가 직원 계정으로 바꾼 경우)
  const tab = tabs.some((t) => t.key === storedTab) ? storedTab : "invoices";

  const currentYm = data.today.slice(0, 7);
  const monthLabel = `${Number(ym.slice(5, 7))}월`;
  // 방문 결제는 조회한 달과 상관없이 납부 전 청구서 전부에서 고른다
  const openInvoices = [
    ...data.invoices.filter((row) => row.status === "REQUESTED"),
    ...data.upcomingInvoices.filter((row) => !data.invoices.some((listed) => listed.id === row.id)),
  ];

  return (
    <div>
      <PageHeader
        title="수강료"
        description={
          fullAccess
            ? "청구서를 발행하고 납부·현장 결제·환불을 한곳에서 확인해요."
            : "청구서 납부 현황을 확인하고 현장 결제를 처리해요."
        }
        actions={
          <>
            <div className="flex items-center gap-x1">
              <Button asChild variant="ghost" size="icon" className="size-x9">
                <Link href={`/tuition?ym=${shiftMonth(ym, -1)}`} aria-label="이전 달">
                  <ChevronLeft />
                </Link>
              </Button>
              <span className="min-w-28 text-center t6-bold tabular-nums text-fg-neutral">{formatYearMonth(ym)}</span>
              <Button asChild variant="ghost" size="icon" className="size-x9">
                <Link href={`/tuition?ym=${shiftMonth(ym, 1)}`} aria-label="다음 달">
                  <ChevronRight />
                </Link>
              </Button>
              {ym !== currentYm && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/tuition">이번 달</Link>
                </Button>
              )}
            </div>
            {fullAccess && (
              <Button onClick={() => setIssueOpen(true)}>
                <FilePlus2 />
                청구서 발행
              </Button>
            )}
          </>
        }
      />

      {kpi ? (
        <StatCards cols={5} className="mb-x6">
          <StatCard label="청구 금액" value={<Money value={kpi.billed} />} unit="원" sub={`${counts.monthInvoices}건`} />
          <StatCard
            label="수납 금액"
            value={<Money value={kpi.received} />}
            unit="원"
            sub={`${monthLabel} 중 실제 입금 ${won(kpi.receivedThisMonth)}`}
          />
          <StatCard
            label="미납 금액"
            value={<Money value={kpi.unpaidAmount} />}
            unit="원"
            tone={kpi.overdueCount > 0 ? "bad" : "gray"}
            sub={`${kpi.unpaidCount}건 · 연체 ${kpi.overdueCount}건`}
          />
          <StatCard label="환불 금액" value={<Money value={kpi.refunded} />} unit="원" />
          <StatCard label="청구 예정" value={kpi.billingTargetCount} unit="명" sub="청구서를 발행할 학생" />
        </StatCards>
      ) : (
        // 직원에게는 금액 합계가 내려오지 않는다 — 건수만 보여 준다
        <StatCards cols={3} className="mb-x6">
          <StatCard label="결제 요청" value={counts.requested} unit="건" />
          <StatCard label="미납" value={counts.overdue} unit="건" tone={counts.overdue > 0 ? "bad" : "gray"} />
          <StatCard
            label="현장 결제 신청"
            value={counts.onsiteRequests}
            unit="건"
            tone={counts.onsiteRequests > 0 ? "warn" : "gray"}
          />
        </StatCards>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
              {t.badge ? <span className="t4-bold tabular-nums text-fg-brand">{t.badge}</span> : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-x6">
        {tab === "invoices" && (
          <InvoicesTab
            invoices={data.invoices}
            upcomingInvoices={data.upcomingInvoices}
            ym={ym}
            fullAccess={fullAccess}
            provider={data.provider}
            onOpenInvoice={setDetailId}
          />
        )}
        {tab === "onsite" && (
          <OnsiteTab
            requests={data.onsiteRequests}
            openInvoices={openInvoices}
            onlinePaymentAvailable={data.onlinePaymentAvailable}
            onOpenInvoice={setDetailId}
          />
        )}
        {tab === "billing" && fullAccess && (
          <BillingTab
            targets={data.billingTargets}
            today={data.today}
            ym={ym}
            dueDays={data.setting.dueDays}
            leadDays={data.setting.leadDays}
          />
        )}
        {tab === "refunds" && <RefundsTab refunds={data.refunds} onOpenInvoice={setDetailId} />}
        {tab === "cashReceipts" && (
          <CashReceiptsTab
            rows={data.cashReceipts}
            fullAccess={fullAccess}
            providerIssue={data.provider?.cashReceipts ?? false}
            onOpenInvoice={setDetailId}
          />
        )}
        {tab === "settings" && fullAccess && (
          <SettingsTab
            setting={data.setting}
            onlinePaymentAvailable={data.onlinePaymentAvailable}
            students={data.students}
            provider={data.provider}
          />
        )}
      </div>

      {issueOpen && (
        <IssueDialog
          students={data.students}
          today={data.today}
          ym={ym}
          dueDays={data.setting.dueDays}
          onClose={() => setIssueOpen(false)}
        />
      )}

      {detailId && (
        <InvoiceDetailDialog
          key={detailId}
          invoiceId={detailId}
          fullAccess={fullAccess}
          refundPolicy={data.setting.refundPolicy}
          provider={data.provider}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}
