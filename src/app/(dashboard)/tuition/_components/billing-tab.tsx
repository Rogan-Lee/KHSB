"use client";

// 청구 예정 탭 (원장급) — 다음 이용 기간의 청구서를 내야 하는 학생. 줄마다 기간·금액·기한을 고쳐 한꺼번에 발행한다.
// 발행은 학생마다 따로 처리되므로 일부만 실패할 수 있다. 실패한 학생은 사유와 함께 목록에 남는다.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, ChevronDown, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Notice, StatusBadge, TableCard, Toolbar, type Tone } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/backoffice/confirm-dialog";
import { issueTuitionInvoices } from "@/actions/tuition";
import type { AdminBillingTarget, BillingTargetReason } from "@/lib/tuition/admin-data";
import { dotDate, won } from "@/lib/tuition/format";
import { cn } from "@/lib/utils";
import {
  defaultIssueDraft,
  evaluateExtraRows,
  evaluateIssueDraft,
  MONTH_OPTIONS,
  toIssueInput,
  type ExtraRowDraft,
  type IssueDraft,
} from "./issue-form";
import { ExtraItemsEditor, ParentMessageInput } from "./issue-dialog";
import { callTuition, MoneyInput, nativeSelectClass, StudentCell, toastIssued } from "./shared";

const REASON_TONE: Record<BillingTargetReason, Tone> = {
  신규: "info",
  "이용 종료 임박": "warn",
  "이용 기간 지남": "bad",
};

// 입력칸이 줄마다 다섯 개라 칸 여백과 입력칸 높이를 줄인다 (사이드바를 편 1280px 화면에서 가로로 넘치지 않게).
// 표 기본 여백(px-x4)은 tailwind-merge 가 정리하지 못하는 SEED 치수라 !(important)로 덮는다.
const CELL = "!px-x2 last:!pr-x4";
const FIELD = "h-9";

export function BillingTab({
  targets,
  today,
  ym,
  dueDays,
  leadDays,
}: {
  targets: AdminBillingTarget[];
  today: string;
  ym: string;
  dueDays: number;
  leadDays: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // 고친 줄만 들고 있는다. 나머지는 서버가 준 기본값(다음 이용 시작일 · 수강료 · 오늘 + 납부 기한 일수)
  const [drafts, setDrafts] = useState<Record<string, IssueDraft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notify, setNotify] = useState(true);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 추가 항목·안내 메시지는 이번에 발행하는 모든 학생에게 똑같이 붙는다 (학생마다 다르게 하려면 따로 발행)
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [extraRows, setExtraRows] = useState<ExtraRowDraft[]>([]);
  const [parentMessage, setParentMessage] = useState("");

  const extras = evaluateExtraRows(extraRows);
  const extraItems = extras.ok ? extras.items : [];

  const rows = targets.map((target) => {
    const draft =
      drafts[target.student.id] ??
      defaultIssueDraft({ periodStart: target.periodStart, monthlyFee: target.monthlyFee, today, dueDays });
    return { target, draft, evaluated: evaluateIssueDraft(draft, extraItems) };
  });
  const ready = rows.filter((row) => row.evaluated.ok);
  const chosen = ready.filter((row) => selected.has(row.target.student.id));
  const total = chosen.reduce((sum, row) => sum + (row.evaluated.ok ? row.evaluated.amount : 0), 0);
  const allSelected = ready.length > 0 && ready.every((row) => selected.has(row.target.student.id));
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
    setSelected(allSelected ? new Set() : new Set(ready.map((row) => row.target.student.id)));
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

  if (targets.length === 0) {
    return (
      <TableCard>
        <EmptyState
          icon={CalendarCheck}
          title="지금 청구할 학생이 없어요"
          description={`다음 이용 시작 ${leadDays}일 전부터 여기에 올라와요. 다른 학생에게 청구하려면 위의 ‘청구서 발행’을 눌러 주세요.`}
        />
      </TableCard>
    );
  }

  return (
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
                  disabled={ready.length === 0 || pending}
                  aria-label={`발행할 수 있는 ${ready.length}명 전체 선택`}
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
              const checked = selected.has(id) && evaluated.ok;
              const failure = failures[id];
              return (
                <TableRow key={id} data-state={checked ? "selected" : undefined}>
                  <TableCell className="!pl-x4 !pr-0 align-top">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(id)}
                      disabled={!evaluated.ok || pending}
                      aria-label={`${target.student.name} 선택`}
                      className="mt-x2"
                    />
                  </TableCell>
                  <TableCell className={cn(CELL, "align-top")}>
                    <StudentCell student={target.student} />
                    <div className="mt-x1 flex flex-wrap items-center gap-x1">
                      <StatusBadge tone={REASON_TONE[target.reason]}>{target.reason}</StatusBadge>
                      {target.coverageEnd && (
                        <span className="whitespace-nowrap t3-regular tabular-nums text-fg-neutral-subtle">
                          ~{dotDate(target.coverageEnd)} 납부
                        </span>
                      )}
                    </div>
                    {failure && <p className="mt-x1 max-w-48 t3-medium text-fg-critical">{failure}</p>}
                  </TableCell>
                  <TableCell className={cn(CELL, "align-top")}>
                    <Input
                      type="date"
                      aria-label={`${target.student.name} 이용 시작일`}
                      value={draft.periodStart}
                      disabled={pending}
                      onChange={(e) => patch(id, draft, { periodStart: e.target.value })}
                      className={cn(FIELD, "w-[8.75rem] tabular-nums")}
                    />
                    <p className="mt-x1 whitespace-nowrap t3-regular tabular-nums text-fg-neutral-subtle">
                      {evaluated.periodEnd ? `~ ${dotDate(evaluated.periodEnd)}` : "—"}
                    </p>
                  </TableCell>
                  <TableCell className={cn(CELL, "align-top")}>
                    <select
                      aria-label={`${target.student.name} 개월 수`}
                      value={draft.months}
                      disabled={pending}
                      onChange={(e) => patch(id, draft, { months: Number(e.target.value) })}
                      className={cn(nativeSelectClass, "h-9 w-20 tabular-nums")}
                    >
                      {MONTH_OPTIONS.map((months) => (
                        <option key={months} value={months}>
                          {months}개월
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className={cn(CELL, "align-top")}>
                    <MoneyInput
                      aria-label={`${target.student.name} 월 수강료`}
                      value={draft.monthlyFee}
                      onValueChange={(digits) => patch(id, draft, { monthlyFee: digits })}
                      disabled={pending}
                      placeholder="금액 입력"
                      className={cn(FIELD, "w-[6.75rem]")}
                    />
                    {target.monthlyFee === null && draft.monthlyFee === "" && (
                      <div className="mt-x1">
                        <StatusBadge tone="warn">수강료 미설정</StatusBadge>
                      </div>
                    )}
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
                    <Input
                      type="date"
                      aria-label={`${target.student.name} 납부 기한`}
                      value={draft.dueDate}
                      disabled={pending}
                      onChange={(e) => patch(id, draft, { dueDate: e.target.value })}
                      className={cn(FIELD, "w-[8.75rem] tabular-nums")}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
      <p className="mt-x2 t3-regular text-fg-neutral-subtle">
        <span className="tabular-nums">{targets.length}명</span> · 다음 이용 시작 {leadDays}일 전부터 올라와요. 월 수강료를
        비워 둔 학생은 금액을 넣어야 발행할 수 있어요. (설정 탭에서 기본·학생별 수강료를 정해 두면 자동으로 채워져요)
      </p>

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
