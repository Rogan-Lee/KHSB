"use client";

// 청구서 발행 (원장급) — "청구 예정"에 아직 올라오지 않은 학생에게도 바로 발행할 수 있다
// (중도 입실, 선결제, 청구 제외로 둔 학생 등). 계산은 청구 예정 표와 같은 issue-form 을 쓴다.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { FormField, Notice } from "@/components/backoffice/ui";
import { issueTuitionInvoices } from "@/actions/tuition";
import type { AdminTuitionStudent } from "@/lib/tuition/admin-data";
import { MAX_EXTRA_ITEM_NAME, MAX_EXTRA_ITEMS, MAX_PARENT_MESSAGE_LEN } from "@/lib/tuition/calc";
import { dotDate, won } from "@/lib/tuition/format";
import {
  defaultIssueDraft,
  evaluateExtraRows,
  evaluateIssueDraft,
  MONTH_OPTIONS,
  newExtraRow,
  type ExtraRowDraft,
  toIssueInput,
  type IssueDraft,
} from "./issue-form";
import { callTuition, MoneyInput, nativeSelectClass, toastIssued } from "./shared";

/** 추가 항목 입력 — 청구 예정 탭의 일괄 발행과 발행 다이얼로그가 함께 쓴다 */
export function ExtraItemsEditor({
  rows,
  onChange,
  disabled,
  error,
  idPrefix,
}: {
  rows: ExtraRowDraft[];
  onChange: (rows: ExtraRowDraft[]) => void;
  disabled?: boolean;
  error?: string | null;
  idPrefix: string;
}) {
  function update(id: string, change: Partial<ExtraRowDraft>) {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...change } : row)));
  }
  return (
    <div className="flex flex-col gap-x2">
      {rows.map((row, index) => (
        <div key={row.id} className="flex items-center gap-x2">
          <Input
            aria-label={`추가 항목 ${index + 1} 이름`}
            id={`${idPrefix}-name-${index}`}
            value={row.name}
            maxLength={MAX_EXTRA_ITEM_NAME}
            disabled={disabled}
            placeholder="항목 이름 (예: 교재비)"
            onChange={(e) => update(row.id, { name: e.target.value })}
            className="min-w-0 flex-1"
          />
          <MoneyInput
            aria-label={`추가 항목 ${index + 1} 금액`}
            value={row.amount}
            onValueChange={(digits) => update(row.id, { amount: digits })}
            disabled={disabled}
            placeholder="금액"
            className="w-32 shrink-0"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={`추가 항목 ${index + 1} 삭제`}
            onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
          >
            <X />
          </Button>
        </div>
      ))}
      {error && <p className="t3-medium text-fg-critical">{error}</p>}
      <div>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          disabled={disabled || rows.length >= MAX_EXTRA_ITEMS}
          onClick={() => onChange([...rows, newExtraRow()])}
        >
          <Plus />
          항목 추가
        </Button>
        {rows.length >= MAX_EXTRA_ITEMS && (
          <span className="ml-x2 t3-regular text-fg-neutral-subtle">최대 {MAX_EXTRA_ITEMS}개까지 넣을 수 있어요.</span>
        )}
      </div>
    </div>
  );
}

/** 학부모 안내 메시지 입력 — 글자 수를 세어 보여 준다 */
export function ParentMessageInput({
  value,
  onChange,
  disabled,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id: string;
}) {
  return (
    <div>
      <Textarea
        id={id}
        value={value}
        maxLength={MAX_PARENT_MESSAGE_LEN}
        rows={3}
        disabled={disabled}
        placeholder="예: 11월부터 교재가 바뀌어 교재비가 함께 청구돼요."
        onChange={(e) => onChange(e.target.value)}
        className="resize-y"
      />
      <p className="mt-x1 text-right t3-regular tabular-nums text-fg-neutral-subtle">
        {value.length}/{MAX_PARENT_MESSAGE_LEN}
      </p>
    </div>
  );
}

export function IssueDialog({
  students,
  today,
  ym,
  dueDays,
  onClose,
}: {
  students: AdminTuitionStudent[];
  today: string;
  ym: string;
  dueDays: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [studentId, setStudentId] = useState("");
  const [draft, setDraft] = useState<IssueDraft | null>(null);
  const [memo, setMemo] = useState("");
  const [extraRows, setExtraRows] = useState<ExtraRowDraft[]>([]);
  const [parentMessage, setParentMessage] = useState("");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const student = students.find((s) => s.id === studentId);
  const extras = evaluateExtraRows(extraRows);
  // 추가 항목이 잘못됐으면 금액 미리보기는 항목 없이 계산하고, 발행은 막는다
  const evaluated = draft ? evaluateIssueDraft(draft, extras.ok ? extras.items : []) : null;

  function pickStudent(id: string) {
    const picked = students.find((s) => s.id === id);
    setStudentId(id);
    setError(null);
    // 학생을 바꾸면 그 학생의 다음 이용 시작일·수강료로 다시 채운다
    setDraft(
      picked
        ? defaultIssueDraft({
            periodStart: picked.nextPeriodStart,
            monthlyFee: picked.effectiveMonthlyFee,
            today,
            dueDays,
          })
        : null,
    );
  }

  function patch(change: Partial<IssueDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...change } : prev));
  }

  function submit() {
    if (!student || !draft || !evaluated?.ok || !extras.ok) return;
    const item = toIssueInput(student.id, draft, evaluated, {
      notify,
      memo: memo.trim() || null,
      extraItems: extras.items,
      parentMessage: parentMessage.trim() || null,
    });
    setError(null);
    startTransition(async () => {
      const res = await callTuition(() => issueTuitionInvoices([item]));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const result = res.data.results[0];
      if (!result?.ok) {
        // 같은 기간의 청구서가 이미 있는 경우 등 — 코어가 준 사유를 그대로 보여 준다
        setError(result?.error ?? "발행하지 못했습니다");
        return;
      }
      toastIssued({
        issued: 1,
        dueDates: [item.dueDate],
        ym,
        onGoToMonth: (month) => router.push(`/tuition?ym=${month}`),
      });
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>청구서 발행</DialogTitle>
          <DialogDescription>
            학생을 고르면 다음 이용 기간과 수강료가 채워져요. 금액은 발행한 뒤 바꿀 수 없으니 확인하고 발행해 주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-x4">
          <FormField label="학생" required>
            <SearchableSelect
              options={students.map((s) => ({ value: s.id, label: `${s.name} · ${s.grade}` }))}
              value={studentId}
              onValueChange={pickStudent}
              placeholder="학생 선택"
              searchPlaceholder="이름·학년 검색"
              emptyText="재원 중인 학생이 없어요"
            />
          </FormField>

          {student?.hasOpenInvoice && (
            <Notice tone="warn">
              아직 납부하지 않은 청구서가 있는 학생이에요. 이용 기간이 겹치면 발행되지 않아요.
            </Notice>
          )}
          {student && student.effectiveMonthlyFee === null && (
            <Notice tone="gray">
              수강료가 정해지지 않은 학생이에요. 이번 청구서의 월 수강료를 직접 입력해 주세요.
            </Notice>
          )}

          {student && draft && evaluated && (
            <>
              <div className="grid grid-cols-2 gap-x3">
                <FormField label="이용 시작일" htmlFor="tuition-issue-start" required>
                  <Input
                    id="tuition-issue-start"
                    type="date"
                    value={draft.periodStart}
                    disabled={pending}
                    onChange={(e) => patch({ periodStart: e.target.value })}
                    className="tabular-nums"
                  />
                </FormField>
                <FormField label="개월 수" htmlFor="tuition-issue-months" required hint="2개월 이상이면 선결제예요.">
                  <select
                    id="tuition-issue-months"
                    value={draft.months}
                    disabled={pending}
                    onChange={(e) => patch({ months: Number(e.target.value) })}
                    className={nativeSelectClass}
                  >
                    {MONTH_OPTIONS.map((months) => (
                      <option key={months} value={months}>
                        {months}개월
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="월 수강료 (원)" htmlFor="tuition-issue-fee" required>
                  <MoneyInput
                    id="tuition-issue-fee"
                    value={draft.monthlyFee}
                    onValueChange={(digits) => patch({ monthlyFee: digits })}
                    disabled={pending}
                    placeholder="금액 입력"
                  />
                </FormField>
                <FormField label="할인 (원)" htmlFor="tuition-issue-discount">
                  <MoneyInput
                    id="tuition-issue-discount"
                    value={draft.discount}
                    onValueChange={(digits) => patch({ discount: digits })}
                    disabled={pending}
                    placeholder="0"
                  />
                </FormField>
                <FormField label="납부 기한" htmlFor="tuition-issue-due" required>
                  <Input
                    id="tuition-issue-due"
                    type="date"
                    value={draft.dueDate}
                    disabled={pending}
                    onChange={(e) => patch({ dueDate: e.target.value })}
                    className="tabular-nums"
                  />
                </FormField>
                <FormField label="메모" htmlFor="tuition-issue-memo" hint="학부모에게는 보이지 않아요.">
                  <Input
                    id="tuition-issue-memo"
                    value={memo}
                    maxLength={300}
                    disabled={pending}
                    onChange={(e) => setMemo(e.target.value)}
                  />
                </FormField>
              </div>

              <FormField
                label="추가 항목"
                hint="교재비처럼 수강료에 더해 청구할 항목이에요. 청구서와 학부모 안내에 항목별로 보여요."
              >
                <ExtraItemsEditor
                  rows={extraRows}
                  onChange={setExtraRows}
                  disabled={pending}
                  error={extras.ok ? null : extras.error}
                  idPrefix="tuition-issue-extra"
                />
              </FormField>

              <FormField
                label="학부모 안내 메시지"
                htmlFor="tuition-issue-parent-message"
                hint="학부모가 청구서에서 볼 수 있는 메시지예요. 위의 메모와 달리 학부모에게 그대로 보이니 신중히 적어 주세요."
              >
                <ParentMessageInput
                  id="tuition-issue-parent-message"
                  value={parentMessage}
                  onChange={setParentMessage}
                  disabled={pending}
                />
              </FormField>

              <div className="rounded-r3 bg-bg-layer-fill px-x4 py-x3">
                <p className="t3-regular tabular-nums text-fg-neutral-subtle">
                  이용 기간{" "}
                  {evaluated.periodEnd ? `${dotDate(draft.periodStart)} ~ ${dotDate(evaluated.periodEnd)}` : "—"}
                </p>
                {evaluated.ok && (extras.ok && extras.items.length > 0 || evaluated.discount > 0) && (
                  <p className="mt-x1 t3-regular tabular-nums text-fg-neutral-subtle">
                    수강료 {won(evaluated.tuition)} ({won(evaluated.monthlyFee)} × {draft.months}개월)
                    {evaluated.extraTotal > 0 && ` + 추가 항목 ${won(evaluated.extraTotal)}`}
                    {evaluated.discount > 0 && ` − 할인 ${won(evaluated.discount)}`}
                  </p>
                )}
                {evaluated.ok ? (
                  <p className="mt-x1 flex items-baseline gap-x1_5">
                    <span className="t3-medium text-fg-neutral-subtle">청구 금액</span>
                    <span className="t8-bold tabular-nums text-fg-neutral">{won(evaluated.amount)}</span>
                  </p>
                ) : (
                  <p className="mt-x1 t4-medium text-fg-critical">{evaluated.error}</p>
                )}
              </div>

              <label className="flex cursor-pointer items-center gap-x2 t4-medium text-fg-neutral">
                <Checkbox checked={notify} onCheckedChange={(checked) => setNotify(checked === true)} disabled={pending} />
                발행하면서 학부모 앱으로 청구 안내 보내기
              </label>
            </>
          )}

          {error && <Notice tone="bad">{error}</Notice>}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button onClick={submit} disabled={pending || !evaluated?.ok || !extras.ok}>
            {pending ? "발행 중…" : evaluated?.ok ? `${won(evaluated.amount)} 청구서 발행` : "청구서 발행"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
