"use client";

// 청구 일정 탭 (원장급) — 청구 일정 계산(lib/tuition/schedule.ts)을 그대로 보여 준다. 매일 자동 청구도 같은 계산을 쓴다.
//  · 독촉: 자동 안내가 끝난 미납 — 골라서 독촉 안내를 보낸다.
//  · 지금 처리: 발행일이 다가온 학생. 막힌 이유(기준일 없음·미납·퇴원 예정 등)가 없으면 자동 청구가 발행일에 낸다.
//    줄마다 기간·금액·기한을 고쳐 직접 발행할 수도 있다 (학생마다 따로 처리돼 일부만 실패할 수 있다).
//    지금 발행할 학생이 아니면 이용 시작일만 "결제 기준일"로 저장한다 — 신규는 등록일~기준일 전날이 일할로 계산된다.
//  · 앞으로 한 달: 그 뒤 발행 일정 (읽기 전용).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing, CalendarCheck, CalendarClock, ChevronDown, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Notice, Section, StatusBadge, TableCard, Toolbar, type Tone } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/backoffice/confirm-dialog";
import {
  issueTuitionInvoices,
  saveTuitionBillingAnchors,
  sendTuitionReminders,
  type TuitionReminderResult,
} from "@/actions/tuition";
import type { AdminBillingTarget, AdminInvoiceRow, BillingTargetReason } from "@/lib/tuition/admin-data";
import { addMonthsClamped, dateKey, DUNNING_INTERVAL_DAYS, parseDateKey } from "@/lib/tuition/calc";
import { dotDate, won } from "@/lib/tuition/format";
import { SCHEDULE_BLOCKER_LABEL, type ScheduleBlocker } from "@/lib/tuition/schedule";
import { cn } from "@/lib/utils";
import {
  defaultIssueDraft,
  evaluateExtraRows,
  evaluateIssueDraft,
  feeForMonths,
  MONTH_OPTIONS,
  toIssueInput,
  type ExtraRowDraft,
  type IssueDraft,
} from "./issue-form";
import { ExtraItemsEditor, ParentMessageInput } from "./issue-dialog";
import { ReminderResultDialog } from "./reminder-result-dialog";
import { callTuition, DENSE_CELL, MoneyInput, nativeSelectClass, shortDate, shortPeriod, StudentCell, toastIssued } from "./shared";

const REASON_TONE: Record<BillingTargetReason, Tone> = {
  신규: "info",
  "이용 종료 임박": "warn",
  "이용 기간 지남": "bad",
};

/** 막힌 이유마다 무엇을 하면 되는지 */
const BLOCKER_HINT: Record<ScheduleBlocker, string> = {
  HOLD: "보류해 둔 학생이라 자동으로 내지 않아요. 설정 탭 학생별 표에서 보류 사유를 지우면 다시 자동으로 나가요.",
  NO_ANCHOR:
    "시스템을 쓰기 전부터 다닌 학생이라 이미 받은 회차가 있을 수 있어요. 다음 청구를 시작할 날(보통 다음 달 1일)을 이용 시작일 칸에 넣고 ‘청구 시작일 저장’을 눌러 주세요.",
  OVERDUE: "밀린 청구서를 먼저 받아 주세요. 위 독촉 목록에서 안내를 보낼 수 있어요.",
  WITHDRAWING: "퇴원 예정이라 자동으로 내지 않아요. 남은 기간은 퇴원할 때 환불로 정산해요.",
  STALE: "이용 기간이 끝난 지 오래됐어요. 계속 다니면 기준일을 다시 정해 주세요.",
};

/** 자동 청구 상태 한 줄 — 막힌 이유가 있으면 그 이유, 없으면 언제 나가는지 */
function ScheduleStatus({
  target,
  today,
  autoIssueEnabled,
  dateShown = false,
}: {
  target: AdminBillingTarget;
  today: string;
  autoIssueEnabled: boolean;
  /** 발행일을 옆 칸에 따로 보여 주면 true — 배지에서 날짜를 뺀다 */
  dateShown?: boolean;
}) {
  if (target.blockers.length > 0) {
    return (
      <div className="flex flex-wrap items-center gap-x1">
        {target.blockers.map((blocker) => (
          <StatusBadge key={blocker} tone={blocker === "NO_ANCHOR" || blocker === "HOLD" ? "warn" : "bad"}>
            {blocker === "WITHDRAWING" && target.withdrawOn
              ? `퇴원 예정 ${dotDate(target.withdrawOn)}`
              : SCHEDULE_BLOCKER_LABEL[blocker]}
          </StatusBadge>
        ))}
      </div>
    );
  }
  const due = target.issueOn <= today;
  const on = dateShown ? "" : `${dotDate(target.issueOn)} `;
  if (autoIssueEnabled) {
    return <StatusBadge tone="ok">{due ? "자동 발행 대기 (매일 오전 10시)" : `${on}자동 발행`}</StatusBadge>;
  }
  return <StatusBadge tone={due ? "warn" : "gray"}>{due ? "발행 필요" : `${on}발행 예정`}</StatusBadge>;
}

// 입력칸이 줄마다 다섯 개라 칸 여백과 입력칸 높이를 줄인다 (사이드바를 편 1280px 화면에서 가로로 넘치지 않게).
// 표 기본 여백(px-x4)은 tailwind-merge 가 정리하지 못하는 SEED 치수라 !(important)로 덮는다.
const CELL = "!px-x2 last:!pr-x4";
const FIELD = "h-9";

export function BillingTab({
  targets,
  ahead,
  dunning,
  today,
  ym,
  dueDays,
  leadDays,
  autoIssueEnabled,
  autoIssueLeadDays,
  prepayMonths,
  onOpenInvoice,
}: {
  targets: AdminBillingTarget[];
  ahead: AdminBillingTarget[];
  dunning: AdminInvoiceRow[];
  today: string;
  ym: string;
  dueDays: number;
  leadDays: number;
  autoIssueEnabled: boolean;
  autoIssueLeadDays: number;
  /** 세 달 선등록 개월 수 — 개월 수를 이만큼 고르면 할인 금액으로 바꾼다 */
  prepayMonths: number;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // 고친 줄만 들고 있는다. 나머지는 서버가 준 기본값(다음 이용 시작일 · 수강료 · 오늘 + 납부 기한 일수)
  const [drafts, setDrafts] = useState<Record<string, IssueDraft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notify, setNotify] = useState(true);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [anchorConfirmOpen, setAnchorConfirmOpen] = useState(false);
  // 추가 항목·안내 메시지는 이번에 발행하는 모든 학생에게 똑같이 붙는다 (학생마다 다르게 하려면 따로 발행)
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [extraRows, setExtraRows] = useState<ExtraRowDraft[]>([]);
  const [parentMessage, setParentMessage] = useState("");

  const extras = evaluateExtraRows(extraRows);
  const extraItems = extras.ok ? extras.items : [];

  const rows = targets.map((target) => {
    const draft =
      drafts[target.student.id] ??
      defaultIssueDraft({
        periodStart: target.periodStart,
        months: target.months,
        prorated: target.prorated && { days: target.prorated.days, dailyRate: target.prorated.dailyRate },
        monthlyFee: target.monthlyFee,
        today,
        dueDays,
      });
    return { target, draft, evaluated: evaluateIssueDraft(draft, extraItems) };
  });
  const ready = rows.filter((row) => row.evaluated.ok);
  const chosen = ready.filter((row) => selected.has(row.target.student.id));
  const total = chosen.reduce((sum, row) => sum + (row.evaluated.ok ? row.evaluated.amount : 0), 0);
  // 기준일 저장은 이용 시작일만 있으면 된다 — 수강료를 아직 안 정한 학생도 고를 수 있다
  const selectable = rows.filter((row) => parseDateKey(row.draft.periodStart) !== null);
  const picked = selectable.filter((row) => selected.has(row.target.student.id));
  // 일할 줄은 입실일부터 정해진 청구다 — 청구 시작일 저장·한 달 미루기는 그 밖의 줄만
  const anchorable = picked.filter((row) => !row.draft.prorated);
  const allSelected = selectable.length > 0 && selectable.every((row) => selected.has(row.target.student.id));
  const failedCount = rows.filter((row) => failures[row.target.student.id]).length;

  function patch(studentId: string, base: IssueDraft, change: Partial<IssueDraft>) {
    setDrafts((prev) => ({ ...prev, [studentId]: { ...base, ...change } }));
  }
  function toggle(studentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((row) => row.target.student.id)));
  }

  /** 이번 회차를 이미 받은 학생들 — 고른 줄의 이용 시작일을 각자 날짜 그대로 다음 달로 넘긴다 */
  function shiftMonth() {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const row of anchorable) {
        const start = parseDateKey(row.draft.periodStart);
        if (start) next[row.target.student.id] = { ...row.draft, periodStart: dateKey(addMonthsClamped(start, 1)) };
      }
      return next;
    });
  }

  function saveAnchors() {
    const items = anchorable.map((row) => ({ studentId: row.target.student.id, billingAnchor: row.draft.periodStart }));
    if (items.length === 0) return;
    startTransition(async () => {
      const res = await callTuition(() => saveTuitionBillingAnchors(items));
      setAnchorConfirmOpen(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.data.saved}명의 청구 시작일을 저장했어요`);
      // 저장한 줄은 서버 값(= 방금 저장한 기준일)을 다시 받는다
      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of items) delete next[item.studentId];
        return next;
      });
      setSelected(new Set());
      router.refresh();
    });
  }

  function issue() {
    if (!extras.ok) return;
    const message = parentMessage.trim() || null;
    const items = chosen.flatMap((row) =>
      row.evaluated.ok
        ? [
            toIssueInput(row.target.student.id, row.draft, row.evaluated, {
              notify,
              extraItems: extras.items,
              parentMessage: message,
            }),
          ]
        : [],
    );
    if (items.length === 0) return;
    startTransition(async () => {
      const res = await callTuition(() => issueTuitionInvoices(items));
      setConfirmOpen(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const failed: Record<string, string> = {};
      for (const result of res.data.results) {
        if (!result.ok) failed[result.studentId] = result.error ?? "발행하지 못했습니다";
      }
      setFailures(failed);
      // 실패한 학생은 고쳐서 다시 낼 수 있게 선택을 남겨 둔다
      setSelected(new Set(Object.keys(failed)));
      if (res.data.issued > 0) {
        const issuedIds = new Set(res.data.results.filter((r) => r.ok).map((r) => r.studentId));
        toastIssued({
          issued: res.data.issued,
          dueDates: items.filter((item) => issuedIds.has(item.studentId)).map((item) => item.dueDate),
          ym,
          onGoToMonth: (month) => router.push(`/tuition?ym=${month}`),
        });
      }
      if (res.data.failed > 0) toast.error(`${res.data.failed}건은 발행하지 못했어요. 목록에서 사유를 확인해 주세요`);
      router.refresh();
    });
  }

  const automation = autoIssueEnabled ? (
    <Notice tone="info" className="mb-x3">
      자동 청구가 켜져 있어요. 아래 ‘확인 필요’ 표시가 없는 학생은 이용 시작 {autoIssueLeadDays}일 전 오전 10시에 자동으로
      발행되고 학부모 앱으로 안내가 가요.
    </Notice>
  ) : (
    <Notice tone="warn" className="mb-x3">
      자동 청구가 꺼져 있어요. 아래 학생들은 직접 발행해야 해요. 설정 탭에서 켜면 이용 시작 {autoIssueLeadDays}일 전에
      자동으로 발행돼요.
    </Notice>
  );

  return (
    <div className="flex flex-col gap-x6">
      {dunning.length > 0 && <DunningSection invoices={dunning} today={today} onOpenInvoice={onOpenInvoice} />}

      <Section
        variant="plain"
        title="지금 처리할 청구"
        count={targets.length}
        description={`발행일이 다가왔거나(이용 시작 ${leadDays}일 전부터) 청구 시작일을 정해야 하는 학생이에요.`}
      >
      {automation}
      {targets.length === 0 ? (
        <TableCard>
          <EmptyState
            icon={CalendarCheck}
            title="지금 청구할 학생이 없어요"
            description={`다음 이용 시작 ${leadDays}일 전부터 여기에 올라와요. 다른 학생에게 청구하려면 위의 ‘청구서 발행’을 눌러 주세요.`}
          />
        </TableCard>
      ) : (
      <div>
      <Toolbar className="gap-x3">
        <label className="flex cursor-pointer items-center gap-x2 t4-medium text-fg-neutral">
          <Checkbox checked={notify} onCheckedChange={(checked) => setNotify(checked === true)} disabled={pending} />
          발행하면서 학부모 앱으로 청구 안내 보내기
        </label>
        <div className="ml-auto flex items-center gap-x3">
          {chosen.length > 0 && (
            <span className="t4-medium tabular-nums text-fg-neutral-muted">합계 {won(total)}</span>
          )}
          <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={pending || chosen.length === 0 || !extras.ok}>
            <FilePlus2 />
            선택 {chosen.length}명 발행
          </Button>
        </div>
      </Toolbar>

      {anchorable.length > 0 && (
        <div className="mb-x3 flex flex-wrap items-center gap-x2 rounded-r3 bg-bg-layer-fill px-x4 py-x3">
          <p className="w-full t3-regular text-fg-neutral-muted">
            지금 발행할 학생이 아니면(이미 받은 회차 등) 이용 시작일을 다음 청구를 시작할 날로 맞춘 뒤 청구 시작일로
            저장하세요. 그 날짜 {autoIssueLeadDays}일 전에 발행돼요.
          </p>
          <Button variant="secondary" size="sm" onClick={shiftMonth} disabled={pending}>
            이용 시작일 한 달 뒤로
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAnchorConfirmOpen(true)} disabled={pending}>
            <CalendarClock />
            {anchorable.length}명 발행 없이 청구 시작일 저장
          </Button>
        </div>
      )}

      <div className="mb-x3 rounded-r3 bg-bg-layer-fill px-x4 py-x3">
        <button
          type="button"
          aria-expanded={extrasOpen}
          onClick={() => setExtrasOpen((open) => !open)}
          className="flex w-full items-center gap-x2 rounded-r1 text-left t4-medium text-fg-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring"
        >
          추가 항목·안내 메시지
          {(extraItems.length > 0 || parentMessage.trim() !== "") && (
            <span className="t3-regular text-fg-neutral-subtle">
              {[
                extraItems.length > 0 ? `추가 항목 ${extraItems.length}건` : null,
                parentMessage.trim() !== "" ? "안내 메시지" : null,
              ]
                .filter(Boolean)
                .join(" · ")}{" "}
              입력됨
            </span>
          )}
          <ChevronDown className={cn("ml-auto size-4 text-fg-neutral-subtle transition-transform", extrasOpen && "rotate-180")} />
        </button>
        {/* 접어 두어도 값은 그대로 적용되므로 닫아도 상태를 지우지 않는다 */}
        <div className={cn("mt-x3 flex flex-col gap-x4", !extrasOpen && "hidden")}>
          <p className="t3-regular text-fg-neutral-subtle">
            여기에 적은 내용은 아래에서 선택한 모든 학생의 청구서에 똑같이 붙어요.
          </p>
          <div>
            <p className="mb-x1_5 t3-medium text-fg-neutral">추가 항목</p>
            <ExtraItemsEditor
              rows={extraRows}
              onChange={setExtraRows}
              disabled={pending}
              error={extras.ok ? null : extras.error}
              idPrefix="tuition-batch-extra"
            />
          </div>
          <div>
            <label htmlFor="tuition-batch-parent-message" className="mb-x1_5 block t3-medium text-fg-neutral">
              학부모 안내 메시지
            </label>
            <p className="mb-x1_5 t3-regular text-fg-neutral-subtle">학부모가 청구서에서 볼 수 있어요.</p>
            <ParentMessageInput
              id="tuition-batch-parent-message"
              value={parentMessage}
              onChange={setParentMessage}
              disabled={pending}
            />
          </div>
        </div>
      </div>

      {failedCount > 0 && (
        <Notice tone="bad" className="mb-x3">
          {failedCount}명은 발행하지 못했어요. 이름 아래 사유를 확인하고 기간·금액을 고쳐 다시 발행해 주세요.
        </Notice>
      )}

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 !pl-x4 !pr-0">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  disabled={selectable.length === 0 || pending}
                  aria-label={`${selectable.length}명 전체 선택`}
                />
              </TableHead>
              <TableHead className={CELL}>학생</TableHead>
              <TableHead className={CELL}>이용 시작일 · 종료일</TableHead>
              <TableHead className={CELL}>개월 수</TableHead>
              <TableHead className={CELL}>월 수강료</TableHead>
              <TableHead className={CELL}>할인</TableHead>
              <TableHead className={cn(CELL, "text-right")}>청구 금액</TableHead>
              <TableHead className={CELL}>납부 기한</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ target, draft, evaluated }) => {
              const id = target.student.id;
              const canSelect = parseDateKey(draft.periodStart) !== null;
              const checked = selected.has(id) && canSelect;
              const failure = failures[id];
              return (
                <TableRow key={id} data-state={checked ? "selected" : undefined}>
                  <TableCell className="!pl-x4 !pr-0 align-top">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(id)}
                      disabled={!canSelect || pending}
                      aria-label={`${target.student.name} 선택`}
                      className="mt-x2"
                    />
                  </TableCell>
                  <TableCell className={cn(CELL, "align-top")}>
                    <StudentCell student={target.student} />
                    <div className="mt-x1 flex flex-wrap items-center gap-x1">
                      <StatusBadge tone={REASON_TONE[target.reason]}>{target.reason}</StatusBadge>
                      {target.prorated && <StatusBadge tone="violet">일할 {target.prorated.days}일</StatusBadge>}
                      <span className="whitespace-nowrap t3-regular text-fg-neutral-subtle">
                        {target.planName}
                        {target.prepay && ` · ${prepayMonths}달 선등록`}
                      </span>
                      {target.coverageEnd && (
                        <span className="whitespace-nowrap t3-regular tabular-nums text-fg-neutral-subtle">
                          ~{dotDate(target.coverageEnd)} 납부
                        </span>
                      )}
                    </div>
                    <div className="mt-x1">
                      <ScheduleStatus target={target} today={today} autoIssueEnabled={autoIssueEnabled} />
                    </div>
                    {target.blockers[0] === "HOLD" && target.holdReason && (
                      <p className="mt-x1 max-w-56 t3-medium text-fg-neutral">보류 사유: {target.holdReason}</p>
                    )}
                    {target.blockers.length > 0 && (
                      <p className="mt-x1 max-w-56 t3-regular text-fg-neutral-subtle">{BLOCKER_HINT[target.blockers[0]]}</p>
                    )}
                    {failure && <p className="mt-x1 max-w-48 t3-medium text-fg-critical">{failure}</p>}
                  </TableCell>
                  <TableCell className={cn(CELL, "align-top")}>
                    <DatePicker
                      size="sm"
                      aria-label={`${target.student.name} 이용 시작일`}
                      value={draft.periodStart || null}
                      disabled={pending}
                      onChange={(value) => patch(id, draft, { periodStart: value ?? "" })}
                      className={cn(FIELD, "w-[8.75rem]")}
                    />
                    <p className="mt-x1 whitespace-nowrap t3-regular tabular-nums text-fg-neutral-subtle">
                      {evaluated.periodEnd ? `~ ${dotDate(evaluated.periodEnd)}` : "—"}
                    </p>
                  </TableCell>
                  <TableCell className={cn(CELL, "align-top")}>
                    {draft.prorated ? (
                      <div className="pt-x2">
                        <p className="whitespace-nowrap t4-regular tabular-nums text-fg-neutral">
                          일할 {draft.prorated.days}일{draft.months > 1 && ` + ${draft.months - 1}개월`}
                        </p>
                        <p className="mt-x1 whitespace-nowrap t3-regular tabular-nums text-fg-neutral-subtle">
                          {won(draft.prorated.dailyRate)} × {draft.prorated.days}일
                        </p>
                      </div>
                    ) : (
                    <select
                      aria-label={`${target.student.name} 개월 수`}
                      value={draft.months}
                      disabled={pending}
                      onChange={(e) => {
                        const months = Number(e.target.value);
                        patch(id, draft, {
                          months,
                          monthlyFee: feeForMonths(draft.monthlyFee, months, {
                            monthlyFee: target.regularMonthlyFee,
                            prepayMonthlyFee: target.prepayMonthlyFee,
                            prepayMonths,
                          }),
                        });
                      }}
                      className={cn(nativeSelectClass, "h-9 w-20 tabular-nums")}
                    >
                      {MONTH_OPTIONS.map((months) => (
                        <option key={months} value={months}>
                          {months}개월
                        </option>
                      ))}
                    </select>
                    )}
                  </TableCell>
                  <TableCell className={cn(CELL, "align-top")}>
                    <MoneyInput
                      aria-label={`${target.student.name} 월 수강료`}
                      value={draft.monthlyFee}
                      onValueChange={(digits) => patch(id, draft, { monthlyFee: digits })}
                      // 일할 줄은 일 단가가 월 수강료에서 나와 고정 — 다르게 받으려면 할인을 쓴다
                      disabled={pending || !!draft.prorated}
                      placeholder="금액 입력"
                      className={cn(FIELD, "w-[6.75rem]")}
                    />
                  </TableCell>
                  <TableCell className={cn(CELL, "align-top")}>
                    <MoneyInput
                      aria-label={`${target.student.name} 할인`}
                      value={draft.discount}
                      onValueChange={(digits) => patch(id, draft, { discount: digits })}
                      disabled={pending}
                      placeholder="0"
                      className={cn(FIELD, "w-24")}
                    />
                  </TableCell>
                  <TableCell className={cn(CELL, "align-top text-right")}>
                    {evaluated.ok ? (
                      <p className="whitespace-nowrap pt-x2 t4-bold text-fg-neutral">{won(evaluated.amount)}</p>
                    ) : (
                      <p className="ml-auto max-w-36 pt-x2 t3-regular text-fg-critical">{evaluated.error}</p>
                    )}
                  </TableCell>
                  <TableCell className={cn(CELL, "align-top")}>
                    <DatePicker
                      size="sm"
                      aria-label={`${target.student.name} 납부 기한`}
                      value={draft.dueDate || null}
                      disabled={pending}
                      onChange={(value) => patch(id, draft, { dueDate: value ?? "" })}
                      className={cn(FIELD, "w-[8.75rem]")}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
      <p className="mt-x2 t3-regular text-fg-neutral-subtle">
        등록 기준은 매월 1일~말일이에요. 달 중간에 입실하면 그달 말일까지 일할로, 15일 이후 입실이면 다음 달까지 한
        청구서로 나가요. 월 수강료는 반(정규반·선택반) 금액이고, 학생별 수강료를 정해 두면 그 금액을 써요. 개월 수를{" "}
        {prepayMonths}개월로 고르면 선등록 할인 금액으로 바뀌어요. ‘확인 필요’ 학생도 직접 골라 발행할 수 있어요.
      </p>
      </div>
      )}
      </Section>

      <AheadSection targets={ahead} today={today} autoIssueEnabled={autoIssueEnabled} />

      <ConfirmDialog
        open={anchorConfirmOpen}
        onOpenChange={setAnchorConfirmOpen}
        title={`${anchorable.length}명의 청구 시작일을 저장할까요?`}
        description={`청구서는 발행하지 않아요. 표에 적힌 이용 시작일부터 청구하고, 그 날짜 ${autoIssueLeadDays}일 전에 발행돼요(자동 청구가 켜져 있으면 자동으로). 1일이 아니면 그달 말일까지 일할로 나가요.`}
        confirmLabel="청구 시작일 저장"
        pendingLabel="저장 중…"
        pending={pending}
        onConfirm={saveAnchors}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`${chosen.length}명에게 청구서를 발행할까요?`}
        description={`합계 ${won(total)}\n${
          notify ? "발행하면 학부모 앱으로 청구 안내가 가요." : "학부모 앱 알림은 보내지 않아요."
        }${extraItems.length > 0 ? ` 추가 항목 ${extraItems.length}건이 모든 청구서에 함께 붙어요.` : ""} 금액과 납부 기한을 다시 확인해 주세요.`}
        confirmLabel="발행"
        pendingLabel="발행 중…"
        pending={pending}
        onConfirm={issue}
      />
    </div>
  );
}

/** 자동 안내가 끝난 미납 — 골라서 독촉 안내(앱 푸시)를 보낸다. 앱이 없는 학부모는 결과 창에서 문구를 복사해 전달한다 */
function DunningSection({
  invoices,
  today,
  onOpenInvoice,
}: {
  invoices: AdminInvoiceRow[];
  today: string;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(invoices.map((row) => row.id)));
  const [reminder, setReminder] = useState<{ results: TuitionReminderResult[]; requested: number } | null>(null);
  const chosen = invoices.filter((row) => selected.has(row.id));
  const noticeTextById = new Map(invoices.map((row) => [row.id, row.noticeText]));
  const todayDate = parseDateKey(today) as Date;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function send() {
    const ids = chosen.map((row) => row.id);
    startTransition(async () => {
      const res = await callTuition(() => sendTuitionReminders(ids, "REMIND"));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setReminder({ results: res.data, requested: ids.length });
      router.refresh();
    });
  }

  return (
    <Section
      variant="plain"
      title="독촉이 필요한 미납"
      count={invoices.length}
      description={`납부 기한이 지나 자동 안내가 끝났어요. ${DUNNING_INTERVAL_DAYS}일마다 다시 여기에 올라와요.`}
      actions={
        <Button size="sm" onClick={send} disabled={pending || chosen.length === 0}>
          <BellRing />
          선택 {chosen.length}건 독촉 보내기
        </Button>
      }
    >
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 !pl-x4 !pr-0" />
              <TableHead className={DENSE_CELL}>학생</TableHead>
              <TableHead className={DENSE_CELL}>청구서</TableHead>
              <TableHead className={cn(DENSE_CELL, "text-right")}>금액</TableHead>
              <TableHead className={DENSE_CELL}>연체</TableHead>
              <TableHead className={DENSE_CELL}>마지막 안내</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((row) => {
              const due = parseDateKey(row.dueDate) as Date;
              const overdueDays = Math.round((todayDate.getTime() - due.getTime()) / 86_400_000);
              return (
                <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined}>
                  <TableCell className="!pl-x4 !pr-0">
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={() => toggle(row.id)}
                      disabled={pending}
                      aria-label={`${row.student.name} 선택`}
                    />
                  </TableCell>
                  <TableCell className={DENSE_CELL}>
                    <StudentCell student={row.student} />
                  </TableCell>
                  <TableCell className={DENSE_CELL}>
                    <button
                      type="button"
                      onClick={() => onOpenInvoice(row.id)}
                      className="rounded-r1 text-left t4-medium text-fg-neutral underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
                    >
                      {row.title}
                    </button>
                  </TableCell>
                  <TableCell className={cn(DENSE_CELL, "text-right t4-bold tabular-nums")}>{won(row.amount)}</TableCell>
                  <TableCell className={DENSE_CELL}>
                    <StatusBadge tone="bad">{overdueDays}일</StatusBadge>
                  </TableCell>
                  <TableCell className={cn(DENSE_CELL, "t3-regular tabular-nums text-fg-neutral-subtle")}>
                    {row.lastNotice ? shortDate(row.lastNotice.createdAt) : "보낸 적 없음"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>

      {reminder && (
        <ReminderResultDialog
          results={reminder.results}
          requestedCount={reminder.requested}
          noticeTextById={noticeTextById}
          onClose={() => setReminder(null)}
        />
      )}
    </Section>
  );
}

/** 지금 처리할 청구 다음, 앞으로 한 달의 발행 일정 (읽기 전용) */
function AheadSection({
  targets,
  today,
  autoIssueEnabled,
}: {
  targets: AdminBillingTarget[];
  today: string;
  autoIssueEnabled: boolean;
}) {
  if (targets.length === 0) return null;
  const total = targets.reduce((sum, target) => sum + (target.blockers.length === 0 ? (target.amount ?? 0) : 0), 0);
  return (
    <Section
      variant="plain"
      title="앞으로 한 달 발행 일정"
      count={targets.length}
      description={`확인 필요가 아닌 학생 합계 ${won(total)} · 발행일이 다가오면 위 ‘지금 처리할 청구’로 올라와요.`}
    >
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={DENSE_CELL}>발행일</TableHead>
              <TableHead className={DENSE_CELL}>학생</TableHead>
              <TableHead className={DENSE_CELL}>이용 기간</TableHead>
              <TableHead className={cn(DENSE_CELL, "text-right")}>금액</TableHead>
              <TableHead className={DENSE_CELL}>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {targets.map((target) => (
              <TableRow key={`${target.student.id}:${target.periodStart}`}>
                <TableCell className={cn(DENSE_CELL, "whitespace-nowrap t4-medium tabular-nums")}>
                  {dotDate(target.issueOn).slice(5)}
                </TableCell>
                <TableCell className={DENSE_CELL}>
                  <StudentCell student={target.student} />
                </TableCell>
                <TableCell className={cn(DENSE_CELL, "whitespace-nowrap t3-regular tabular-nums text-fg-neutral-muted")}>
                  {shortPeriod(target.periodStart, target.periodEnd)}
                  {target.prorated && ` · 일할 ${target.prorated.days}일`}
                </TableCell>
                <TableCell className={cn(DENSE_CELL, "text-right t4-bold tabular-nums")}>
                  {target.amount === null ? "—" : won(target.amount)}
                </TableCell>
                <TableCell className={DENSE_CELL}>
                  <ScheduleStatus target={target} today={today} autoIssueEnabled={autoIssueEnabled} dateShown />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </Section>
  );
}
