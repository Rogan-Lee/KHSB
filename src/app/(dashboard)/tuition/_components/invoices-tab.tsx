"use client";

// 청구·수납 탭 — 조회한 달의 청구서 + 이전 달에서 넘어온 미납.
// "처리 필요" 필터만은 달과 상관없이 운영진이 손봐야 할 청구서를 전부 보여 준다.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Link2, MessageSquareText, Receipt, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, FilterChip, SearchField, StatusBadge, TableCard, Toolbar } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/backoffice/confirm-dialog";
import {
  exportTuitionCsv,
  getTuitionBillLink,
  sendTuitionBillTalk,
  sendTuitionReminders,
  type TuitionReminderResult,
  type TuitionTalkResult,
} from "@/actions/tuition";
import type { AdminInvoiceRow } from "@/lib/tuition/admin-data";
import type { TuitionProviderInfo } from "@/lib/tuition/provider-info";
import { NOTICE_KIND_LABEL, won } from "@/lib/tuition/format";
import { cn } from "@/lib/utils";
import { formatYearMonth } from "@/lib/online/month";
import { ReminderResultDialog } from "./reminder-result-dialog";
import { TalkResultDialog } from "./talk-result-dialog";
import {
  callTuition,
  copyText,
  DENSE_CELL,
  DueCell,
  InvoiceFlagBadges,
  InvoiceStatusBadge,
  noticeKindFor,
  shortDate,
  shortDateTime,
  shortPeriod,
  StudentCell,
} from "./shared";

type Filter = "ALL" | "REQUESTED" | "OVERDUE" | "PAID" | "REFUNDED" | "ATTENTION";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "REQUESTED", label: "결제 요청" },
  { key: "OVERDUE", label: "미납" },
  { key: "PAID", label: "납부 완료" },
  { key: "REFUNDED", label: "환불" },
  { key: "ATTENTION", label: "처리 필요" },
];

function matchesFilter(row: AdminInvoiceRow, filter: Filter): boolean {
  if (filter === "ATTENTION") return row.attention.length > 0;
  // 다른 달 청구서는 처리할 것이 있어 함께 내려온 것 — "처리 필요"에서만 보인다
  if (!row.inMonth && !row.carriedOver) return false;
  switch (filter) {
    case "ALL":
      return true;
    case "REQUESTED":
      return row.displayStatus === "REQUESTED";
    case "OVERDUE":
      return row.displayStatus === "OVERDUE";
    case "PAID":
      return row.displayStatus === "PAID";
    case "REFUNDED":
      return row.displayStatus === "PARTIALLY_REFUNDED" || row.displayStatus === "REFUNDED";
  }
}

const EMPTY_TEXT: Record<Filter, string> = {
  ALL: "이 달에 발행한 청구서가 없어요",
  REQUESTED: "결제를 기다리는 청구서가 없어요",
  OVERDUE: "납부 기한이 지난 청구서가 없어요",
  PAID: "납부 완료된 청구서가 없어요",
  REFUNDED: "환불한 청구서가 없어요",
  ATTENTION: "처리할 것이 없어요",
};

export function InvoicesTab({
  invoices,
  upcomingInvoices,
  fullAccess,
  provider,
  ym,
  onOpenInvoice,
}: {
  invoices: AdminInvoiceRow[];
  upcomingInvoices: AdminInvoiceRow[];
  fullAccess: boolean;
  /** 연결된 결제사 — null 이면 온라인 결제 없음. 알림톡 청구서는 결제사가 보내 줄 수 있을 때만 */
  provider: TuitionProviderInfo | null;
  /** 조회 중인 달 (YYYY-MM) — 엑셀 내보내기 대상 */
  ym: string;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exporting, startExport] = useTransition();
  const [talkConfirmOpen, setTalkConfirmOpen] = useState(false);
  const [talk, setTalk] = useState<{ results: TuitionTalkResult[]; requested: number } | null>(null);
  const [reminder, setReminder] = useState<{ results: TuitionReminderResult[]; requested: number } | null>(null);

  const counts = useMemo(() => {
    const map = {} as Record<Filter, number>;
    for (const f of FILTERS) map[f.key] = invoices.filter((row) => matchesFilter(row, f.key)).length;
    return map;
  }, [invoices]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter(
      (row) => matchesFilter(row, filter) && (!q || row.student.name.toLowerCase().includes(q)),
    );
  }, [invoices, filter, query]);

  // 안내는 아직 받지 못한 청구서에만 보낸다
  const selectable = rows.filter((row) => row.status === "REQUESTED");
  const targets = invoices.filter((row) => row.status === "REQUESTED" && selected.has(row.id));
  const overdueTargets = targets.filter((row) => row.displayStatus === "OVERDUE");
  const allSelected = selectable.length > 0 && selectable.every((row) => selected.has(row.id));

  const noticeTextById = useMemo(() => new Map(invoices.map((row) => [row.id, row.noticeText])), [invoices]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((row) => row.id)));
  }

  function sendReminders() {
    // 기한 전 청구서에는 청구 안내를, 기한이 지난 청구서에는 미납 안내를 보낸다 (복사용 안내문과 같은 문구)
    const groups = [
      { kind: "REMIND" as const, ids: targets.filter((row) => noticeKindFor(row.displayStatus) === "REMIND").map((row) => row.id) },
      { kind: "REQUEST" as const, ids: targets.filter((row) => noticeKindFor(row.displayStatus) === "REQUEST").map((row) => row.id) },
    ].filter((group) => group.ids.length > 0);
    const requested = targets.length;

    startTransition(async () => {
      const results: TuitionReminderResult[] = [];
      let failure: string | null = null;
      for (const group of groups) {
        const res = await callTuition(() => sendTuitionReminders(group.ids, group.kind));
        if (res.ok) results.push(...res.data);
        else failure = res.error;
      }
      setConfirmOpen(false);
      if (failure) toast.error(failure);
      if (results.length > 0) {
        setReminder({ results, requested });
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  const canTalk = fullAccess && !!provider?.canNotify;

  function sendTalk() {
    const ids = targets.map((row) => row.id);
    startTransition(async () => {
      const res = await callTuition(() => sendTuitionBillTalk(ids));
      setTalkConfirmOpen(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTalk({ results: res.data.results, requested: ids.length });
      setSelected(new Set());
      router.refresh();
    });
  }

  function exportCsv() {
    startExport(async () => {
      const res = await callTuition(() => exportTuitionCsv(ym));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // 엑셀이 한글을 UTF-8 로 읽게 하는 BOM 은 여기서 붙인다 — 서버 액션 응답을 거치면 맨 앞 BOM 이 떨어져 나간다
      const url = URL.createObjectURL(
        new Blob(["\uFEFF", res.data.csv.replace(/^\uFEFF/, "")], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = res.data.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`${res.data.count}건을 내보냈어요`);
    });
  }

  const firstUpcoming = upcomingInvoices[0];

  return (
    <div>
      <Toolbar>
        {FILTERS.map((f) => (
          <FilterChip key={f.key} selected={filter === f.key} count={counts[f.key]} onClick={() => setFilter(f.key)}>
            {f.label}
          </FilterChip>
        ))}
        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          placeholder="학생 이름 검색"
          aria-label="학생 이름 검색"
          className="sm:w-56"
        />
        {fullAccess && (
          <div className="ml-auto flex items-center gap-x3">
            {targets.length > 0 && (
              <span className="t4-medium tabular-nums text-fg-neutral-muted">{targets.length}건 선택됨</span>
            )}
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
              <Download />
              {exporting ? "내보내는 중…" : "엑셀 내보내기"}
            </Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={pending || targets.length === 0}>
              <Send />
              미납 안내 발송
            </Button>
            {canTalk && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTalkConfirmOpen(true)}
                disabled={pending || targets.length === 0}
              >
                <MessageSquareText />
                알림톡 청구서 발송
              </Button>
            )}
          </div>
        )}
      </Toolbar>

      {firstUpcoming && (
        <p className="mb-x3 t3-regular text-fg-neutral-subtle">
          납부 기한이 다음 달 이후인 결제 요청 <span className="t3-bold tabular-nums text-fg-neutral">{upcomingInvoices.length}건</span>은
          해당 달 목록에 있어요.{" "}
          <Link
            href={`/tuition?ym=${firstUpcoming.dueDate.slice(0, 7)}`}
            className="t3-medium text-fg-brand underline-offset-4 hover:underline"
          >
            {formatYearMonth(firstUpcoming.dueDate.slice(0, 7))} 보기
          </Link>
        </p>
      )}

      <TableCard>
        {rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={query.trim() ? "검색 결과가 없어요" : EMPTY_TEXT[filter]}
            description={
              query.trim()
                ? "학생 이름을 다시 확인해 주세요."
                : filter === "ALL" && fullAccess
                  ? "청구 예정 탭에서 청구서를 발행할 수 있어요."
                  : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {fullAccess && (
                  <TableHead className={cn(DENSE_CELL, "w-10 !pr-0")}>
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      disabled={selectable.length === 0}
                      aria-label="결제 요청 전체 선택"
                    />
                  </TableHead>
                )}
                <TableHead className={DENSE_CELL}>학생</TableHead>
                <TableHead className={DENSE_CELL}>청구 내용</TableHead>
                <TableHead className={cn(DENSE_CELL, "text-right")}>금액</TableHead>
                <TableHead className={DENSE_CELL}>납부 기한</TableHead>
                <TableHead className={DENSE_CELL}>상태</TableHead>
                <TableHead className={DENSE_CELL}>납부 정보</TableHead>
                <TableHead className={DENSE_CELL}>최근 안내</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <InvoiceRow
                  key={row.id}
                  row={row}
                  selectable={fullAccess}
                  checked={selected.has(row.id)}
                  onToggle={() => toggle(row.id)}
                  onOpen={() => onOpenInvoice(row.id)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
      {rows.length > 0 && (
        <p className="mt-x2 t3-regular text-fg-neutral-subtle" aria-live="polite">
          <span className="tabular-nums">{rows.length}건</span> · 행을 누르면 결제·환불 내역과 진행 기록을 볼 수 있어요.
          {fullAccess && " 아직 납부 전인 청구서를 골라 안내를 다시 보낼 수 있어요."}
        </p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`${targets.length}건에 납부 안내를 보낼까요?`}
        description={
          overdueTargets.length === targets.length
            ? "학부모 앱으로 미납 안내 알림을 보내요."
            : overdueTargets.length === 0
              ? "아직 납부 기한 전이라 청구 안내 알림을 다시 보내요."
              : `기한이 지난 ${overdueTargets.length}건은 미납 안내, 기한 전 ${targets.length - overdueTargets.length}건은 청구 안내를 보내요.`
        }
        confirmLabel="안내 보내기"
        pendingLabel="보내는 중…"
        pending={pending}
        onConfirm={sendReminders}
      />

      {canTalk && (
        <ConfirmDialog
          open={talkConfirmOpen}
          onOpenChange={setTalkConfirmOpen}
          title={`${targets.length}건에 알림톡 청구서를 보낼까요?`}
          description={`${provider?.label ?? "결제사"}에서 선택한 청구서의 학부모 휴대폰으로 카카오 알림톡 청구서를 보내요. 보낼 때마다 쌤포인트가 차감돼요. 결제 요청 상태인 청구서만 보낼 수 있어요.`}
          confirmLabel="알림톡 보내기"
          pendingLabel="보내는 중…"
          pending={pending}
          onConfirm={sendTalk}
        />
      )}

      {talk && <TalkResultDialog results={talk.results} requestedCount={talk.requested} onClose={() => setTalk(null)} />}

      {reminder && (
        <ReminderResultDialog
          results={reminder.results}
          requestedCount={reminder.requested}
          noticeTextById={noticeTextById}
          onClose={() => setReminder(null)}
        />
      )}
    </div>
  );
}

function InvoiceRow({
  row,
  selectable,
  checked,
  onToggle,
  onOpen,
}: {
  row: AdminInvoiceRow;
  selectable: boolean;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const open = row.status === "REQUESTED";
  const [linking, startLink] = useTransition();
  const extraSummary =
    row.extraItems.length === 0
      ? null
      : row.extraItems.length === 1
        ? `${row.extraItems[0].name} 포함`
        : `추가 항목 ${row.extraItems.length}건 포함`;

  function copyBillLink() {
    if (row.billUrl) {
      void copyText(row.billUrl, `${row.student.name} 청구서 링크를 복사했어요`);
      return;
    }
    // 목록에 링크가 없으면(아직 만들어지지 않은 청구서) 서버에서 받아 온다
    startLink(async () => {
      const res = await callTuition(() => getTuitionBillLink(row.id));
      if (res.ok) await copyText(res.data.url, `${row.student.name} 청구서 링크를 복사했어요`);
      else toast.error(res.error);
    });
  }
  const deposit = row.openPayment?.link?.state === "DEPOSIT_WAITING" ? row.openPayment.link : null;
  return (
    <TableRow data-state={checked ? "selected" : undefined} onClick={onOpen} className="cursor-pointer">
      {selectable && (
        <TableCell className={cn(DENSE_CELL, "!pr-0")} onClick={(e) => e.stopPropagation()}>
          {open && <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={`${row.student.name} 선택`} />}
        </TableCell>
      )}
      <TableCell className={DENSE_CELL}>
        <StudentCell student={row.student} />
      </TableCell>
      <TableCell className={DENSE_CELL}>
        {/* 키보드로도 상세를 열 수 있게 제목을 버튼으로 둔다 (행 클릭과 같은 동작) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="whitespace-nowrap rounded-r1 text-left t4-medium text-fg-neutral underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring"
        >
          {row.title}
        </button>
        <p className="mt-x0_5 whitespace-nowrap t3-regular text-fg-neutral-subtle">
          {shortPeriod(row.periodStart, row.periodEnd)}
          {row.autoIssued && <span className="ml-x1_5">· 자동 청구</span>}
        </p>
      </TableCell>
      <TableCell className={cn(DENSE_CELL, "text-right")}>
        <p className="whitespace-nowrap t4-bold text-fg-neutral">{won(row.amount)}</p>
        {extraSummary && (
          <p
            className="mt-x0_5 whitespace-nowrap t3-regular text-fg-neutral-subtle"
            title={row.extraItems.map((item) => `${item.name} ${won(item.amount)}`).join("\n")}
          >
            {extraSummary}
          </p>
        )}
        {row.refundedAmount > 0 && (
          <p className="mt-x0_5 whitespace-nowrap t3-regular text-fg-neutral-subtle">환불 {won(row.refundedAmount)}</p>
        )}
      </TableCell>
      <TableCell className={DENSE_CELL}>
        <DueCell dueDate={row.dueDate} daysToDue={row.daysToDue} open={open} />
        {row.carriedOver && <p className="mt-x0_5 whitespace-nowrap t3-regular text-fg-neutral-subtle">이전 달 청구</p>}
      </TableCell>
      <TableCell className={DENSE_CELL}>
        <div className="flex flex-wrap items-center gap-x1">
          <InvoiceStatusBadge status={row.displayStatus} />
          <InvoiceFlagBadges row={row} />
        </div>
      </TableCell>
      <TableCell className={DENSE_CELL}>
        {row.paidAt ? (
          <div className="whitespace-nowrap">
            <p className="t4-regular text-fg-neutral">{row.paidMethodLabel ?? "납부"}</p>
            <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">{shortDateTime(row.paidAt)}</p>
          </div>
        ) : deposit ? (
          <div className="whitespace-nowrap">
            <p className="t4-regular text-fg-neutral">가상계좌{deposit.depositBank ? ` · ${deposit.depositBank}` : ""}</p>
            {deposit.depositDueAt && (
              <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">{shortDateTime(deposit.depositDueAt)}까지 입금</p>
            )}
          </div>
        ) : (
          <span className="text-fg-placeholder">—</span>
        )}
      </TableCell>
      <TableCell className={DENSE_CELL}>
        {row.lastNotice ? (
          <div className="whitespace-nowrap">
            <p className="flex items-center gap-x1 t4-regular text-fg-neutral">
              {shortDate(row.lastNotice.createdAt)}
              {row.lastNotice.sentCount > 0 ? (
                <span className="t3-regular text-fg-neutral-subtle">도달 {row.lastNotice.sentCount}대</span>
              ) : (
                <StatusBadge tone="warn">미도달</StatusBadge>
              )}
            </p>
            <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">
              {NOTICE_KIND_LABEL[row.lastNotice.kind]} · 총 {row.noticeCount}회
            </p>
          </div>
        ) : (
          <span className="text-fg-placeholder">—</span>
        )}
        {/* 링크는 아직 받지 못한 청구서에만 — 납부·취소된 청구서는 상세에서 복사할 수 있다 */}
        {row.status === "REQUESTED" && (
          <div className="mt-x1" onClick={(e) => e.stopPropagation()}>
            <Button type="button" variant="ghost" size="xs" onClick={copyBillLink} disabled={linking}>
              <Link2 />
              청구서 링크 복사
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
