"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TimePickerInput } from "@/components/ui/time-picker";
import { EmptyState, FormActions, FormField, StatusBadge } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { toast } from "sonner";
import { Trash2, ChevronDown, FileText, Plus, AlertTriangle } from "lucide-react";
import { createContract, deleteContract } from "@/actions/payroll";
import { MIN_HOURLY_WAGE_2026 } from "@/lib/payroll";
import { cn } from "@/lib/utils";
import type { PayrollContract } from "@/generated/prisma";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  contracts: PayrollContract[];
  /** 계약 추가 후 호출 — 부모에서 listContracts 재호출에 사용. */
  onChanged?: () => void;
}

function formatYmd(d: Date | null | undefined): string {
  if (!d) return "현재";
  // KST 로 표시 (DB 는 UTC midnight 의 KST 1일을 의미)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function formatWorkSchedule(days: number[], start: string | null, end: string | null): string | null {
  if (!days || days.length === 0 || !start || !end) return null;
  const labels = [...days].sort((a, b) => a - b).map((d) => DOW[d]).join("·");
  return `${labels} ${start}~${end}`;
}

function DetailRow({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-x0_5", full && "col-span-2")}>
      <dt className="t3-medium text-fg-neutral-subtle">{label}</dt>
      <dd className="break-words t4-regular tabular-nums text-fg-neutral">{value}</dd>
    </div>
  );
}

/**
 * 근무자별 PayrollContract 이력 + 신규 계약 입력 다이얼로그.
 * 직원 관리(계약 관리)와 급여 정산(급여 기준)에서 사용.
 */
export function ContractHistoryDialog({
  open,
  onOpenChange,
  userId,
  userName,
  contracts,
  onChanged,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PayrollContract | null>(null);
  const [, startDelete] = useTransition();

  // 확인은 ConfirmDialog 에서 받는다 (window.confirm 대체)
  function handleDelete(c: PayrollContract) {
    setDeletingId(c.id);
    startDelete(async () => {
      try {
        await deleteContract(c.id);
        toast.success("계약이 삭제되었습니다");
        onChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "계약 삭제에 실패했습니다");
      } finally {
        setDeletingId(null);
        setDeleteTarget(null);
      }
    });
  }

  // 정렬: effectiveTo=null(활성) 최상단, 그 후 effectiveFrom desc
  const sorted = useMemo(() => {
    return [...contracts].sort((a, b) => {
      const aActive = a.effectiveTo === null;
      const bActive = b.effectiveTo === null;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return (
        new Date(b.effectiveFrom).getTime() -
        new Date(a.effectiveFrom).getTime()
      );
    });
  }, [contracts]);

  const deletingActive = deleteTarget?.effectiveTo === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="t7-bold">{userName}님의 급여 계약</DialogTitle>
          <DialogDescription>
            시급·주휴·고정 수당 계약 이력이에요. 신규 계약을 추가하면 직전 계약은 자동으로 끝나요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-x3">
          {sorted.length === 0 ? (
            !showForm && (
              <div className="rounded-r3 bg-bg-layer-fill">
                <EmptyState
                  compact
                  icon={FileText}
                  title="계약 이력이 없어요"
                  description="신규 계약을 추가해 급여 기준을 정하세요."
                />
              </div>
            )
          ) : (
            <ul className="flex flex-col gap-x2">
              {sorted.map((c) => {
                const isActive = c.effectiveTo === null;
                const isExpanded = expandedId === c.id;
                const schedule = formatWorkSchedule(c.workDays, c.workStartTime, c.workEndTime);
                const isMonthly = c.monthlySalary != null && c.monthlySalary > 0;
                return (
                  <li
                    key={c.id}
                    className={cn(
                      "rounded-r3 border px-x4 py-x3",
                      isActive ? "border-stroke-neutral-weak bg-bg-layer-default" : "border-stroke-neutral-muted bg-bg-layer-fill",
                    )}
                  >
                    <div className="flex items-center justify-between gap-x2">
                      <button
                        type="button"
                        onClick={() => setExpandedId((cur) => (cur === c.id ? null : c.id))}
                        aria-expanded={isExpanded}
                        className="flex min-w-0 items-center gap-x1_5 rounded-r2 text-left"
                      >
                        <ChevronDown
                          aria-hidden
                          className={cn(
                            "size-4 shrink-0 text-fg-neutral-subtle transition-transform",
                            isExpanded && "rotate-180",
                          )}
                        />
                        <span className="truncate t4-bold tabular-nums text-fg-neutral">
                          {formatYmd(c.effectiveFrom)} ~ {formatYmd(c.effectiveTo)}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-x1">
                        {isActive && <StatusBadge tone="ok">적용 중</StatusBadge>}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(c)}
                          disabled={deletingId === c.id}
                          aria-label="계약 삭제"
                          className="text-fg-neutral-subtle hover:text-fg-critical"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>

                    {/* 요약 (한 줄 미리보기) */}
                    <div className="mt-x1 flex flex-wrap items-baseline gap-x-x3 gap-y-x1 pl-5.5 t3-regular text-fg-neutral-subtle">
                      <span className="t5-bold tabular-nums text-fg-neutral">
                        {isMonthly ? `월급 ${formatWon(c.monthlySalary ?? 0)}` : `시급 ${formatWon(c.hourlyRate)}`}
                      </span>
                      <span>주휴 {c.weeklyHolidayPay ? "지급" : "미지급"}</span>
                      {c.monthlyBonusKrw > 0 && <span className="tabular-nums">보너스 {formatWon(c.monthlyBonusKrw)}</span>}
                      {schedule && <span>근무 {schedule}</span>}
                    </div>

                    {/* 전체 상세 (펼침) */}
                    {isExpanded && (
                      <dl className="mt-x3 grid grid-cols-2 gap-x-x4 gap-y-x3 border-t border-stroke-neutral-muted pt-x3">
                        <DetailRow label="적용 기간" value={`${formatYmd(c.effectiveFrom)} ~ ${formatYmd(c.effectiveTo)}`} />
                        <DetailRow label="시급" value={formatWon(c.hourlyRate)} />
                        {isMonthly && (
                          <DetailRow label="월 기본급" value={formatWon(c.monthlySalary ?? 0)} />
                        )}
                        <DetailRow label="주휴수당" value={c.weeklyHolidayPay ? "지급" : "미지급"} />
                        <DetailRow label="고정 보너스" value={c.monthlyBonusKrw > 0 ? formatWon(c.monthlyBonusKrw) : "없음"} />
                        <DetailRow label="근무 요일·시간" value={schedule ?? "미설정"} />
                        <DetailRow label="등록일" value={formatYmd(c.createdAt)} />
                        {c.note && <DetailRow label="비고" value={c.note} full />}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {showForm ? (
            <NewContractForm
              userId={userId}
              onCancel={() => setShowForm(false)}
              onCreated={() => {
                setShowForm(false);
                onChanged?.();
              }}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => setShowForm(true)}
            >
              <Plus />
              신규 계약
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            닫기
          </Button>
        </DialogFooter>

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(o) => {
            if (!o) setDeleteTarget(null);
          }}
          title={deletingActive ? "현재 적용 중인 계약을 삭제할까요?" : "이 계약을 삭제할까요?"}
          description={
            deletingActive
              ? "직전 계약이 있으면 그 계약이 다시 적용돼요."
              : "삭제한 계약은 되돌릴 수 없어요."
          }
          tone="critical"
          confirmLabel="삭제"
          pendingLabel="삭제 중…"
          pending={deletingId !== null}
          onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        >
          {deleteTarget && (
            <p className="rounded-r2 bg-bg-layer-fill px-x3 py-x2_5 t4-regular tabular-nums text-fg-neutral-muted">
              {formatYmd(deleteTarget.effectiveFrom)} ~ {formatYmd(deleteTarget.effectiveTo)} ·{" "}
              {deleteTarget.monthlySalary != null && deleteTarget.monthlySalary > 0
                ? `월급 ${formatWon(deleteTarget.monthlySalary)}`
                : `시급 ${formatWon(deleteTarget.hourlyRate)}`}
            </p>
          )}
        </ConfirmDialog>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────
// 신규 계약 입력 폼 (inline)
// ──────────────────────────────────────────────────────────────────

function defaultEffectiveFromYm(): string {
  // 기본값: 오늘 기준 다음 달 1일 (YYYY-MM)
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth(); // 다음 달
  // 다음 달
  const next = new Date(Date.UTC(y, m + 1, 1));
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, "0");
  return `${ny}-${nm}`;
}

function NewContractForm({
  userId,
  onCancel,
  onCreated,
}: {
  userId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [yearMonth, setYearMonth] = useState<string>(defaultEffectiveFromYm());
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [monthlySalary, setMonthlySalary] = useState<string>("");
  const [weeklyHolidayPay, setWeeklyHolidayPay] = useState(true);
  const [monthlyBonus, setMonthlyBonus] = useState<string>("");
  const [note, setNote] = useState("");
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [workStart, setWorkStart] = useState<string>("14:00");
  const [workEnd, setWorkEnd] = useState<string>("22:00");
  const [isPending, startTransition] = useTransition();

  function toggleDay(d: number) {
    setWorkDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  }

  function handleSubmit() {
    // yearMonth = "YYYY-MM" → "YYYY-MM-01T00:00:00+09:00" 으로 KST 1일을 표현.
    // 서버의 normalizeContractFromDate 가 KST 환산 후 UTC midnight 으로 정규화.
    if (!/^\d{4}-\d{2}$/.test(yearMonth.trim())) {
      toast.error("시작월 형식이 올바르지 않습니다 (YYYY-MM)");
      return;
    }
    const effectiveFrom = new Date(`${yearMonth}-01T00:00:00+09:00`);
    if (Number.isNaN(effectiveFrom.getTime())) {
      toast.error("시작월이 올바르지 않습니다");
      return;
    }

    const hr = Number(hourlyRate);
    if (!Number.isFinite(hr) || hr <= 0) {
      toast.error("시급은 0보다 커야 합니다");
      return;
    }

    const salary = monthlySalary.trim() === "" ? null : Number(monthlySalary);
    if (salary != null && (!Number.isFinite(salary) || salary < 0)) {
      toast.error("월 기본급은 0 이상이어야 합니다");
      return;
    }

    const bonus = monthlyBonus.trim() === "" ? 0 : Number(monthlyBonus);
    if (!Number.isFinite(bonus) || bonus < 0) {
      toast.error("보너스는 0 이상이어야 합니다");
      return;
    }

    // 근무 조건: 요일 선택 시 시작·종료 시간 필수
    const hasDays = workDays.length > 0;
    if (hasDays && (!/^\d{2}:\d{2}$/.test(workStart) || !/^\d{2}:\d{2}$/.test(workEnd))) {
      toast.error("근무 시작·종료 시간을 입력하세요");
      return;
    }

    startTransition(async () => {
      try {
        await createContract(userId, {
          effectiveFrom,
          hourlyRate: hr,
          monthlySalary: salary,
          weeklyHolidayPay,
          monthlyBonusKrw: bonus,
          note: note.trim() || undefined,
          workDays: hasDays ? workDays : [],
          workStartTime: hasDays ? workStart : undefined,
          workEndTime: hasDays ? workEnd : undefined,
        });
        toast.success("신규 계약이 등록되었습니다");
        onCreated();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "계약 등록에 실패했습니다",
        );
      }
    });
  }

  const belowMinWage =
    hourlyRate.trim() !== "" &&
    Number(hourlyRate) > 0 &&
    Number(hourlyRate) < MIN_HOURLY_WAGE_2026;

  return (
    <div className="flex flex-col gap-x4 rounded-r3 border border-stroke-neutral-muted bg-bg-layer-fill p-x4 sm:p-x5">
      <p className="t5-bold text-fg-neutral">신규 계약</p>

      <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2">
        <FormField label="시작월" htmlFor="contract-from" required hint="매월 1일부터 적용돼요">
          <Input
            id="contract-from"
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            disabled={isPending}
          />
        </FormField>
        <FormField label="시급 (원)" htmlFor="contract-rate" required>
          <Input
            id="contract-rate"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            placeholder="예: 12000"
            className="tabular-nums"
            disabled={isPending}
          />
          {belowMinWage && (
            <p className="flex items-center gap-x1 t3-regular text-fg-warning">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              2026년 최저임금({MIN_HOURLY_WAGE_2026.toLocaleString("ko-KR")}원)보다 낮아요.
            </p>
          )}
        </FormField>
      </div>

      <FormField
        label="월 기본급 (원)"
        htmlFor="contract-salary"
        hint="비워두면 시급제(시간×시급+주휴)로, 입력하면 근무시간과 상관없이 고정 월급으로 정산해요."
      >
        <Input
          id="contract-salary"
          type="number"
          inputMode="numeric"
          min={0}
          step={10000}
          value={monthlySalary}
          onChange={(e) => setMonthlySalary(e.target.value)}
          placeholder="선택 · 입력 시 고정 월급으로 정산"
          className="tabular-nums"
          disabled={isPending}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2">
        <FormField label="고정 보너스 (원)" htmlFor="contract-bonus">
          <Input
            id="contract-bonus"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={monthlyBonus}
            onChange={(e) => setMonthlyBonus(e.target.value)}
            placeholder="선택 · 예: 식대 100000"
            className="tabular-nums"
            disabled={isPending}
          />
        </FormField>
        <div className="flex items-center gap-x2 sm:pt-x7">
          <Checkbox
            id="contract-whp"
            checked={weeklyHolidayPay}
            onCheckedChange={(v) => setWeeklyHolidayPay(v === true)}
            disabled={isPending}
          />
          <Label htmlFor="contract-whp">주휴수당 포함</Label>
        </div>
      </div>

      {/* 근무 조건 — 계약 등록 시 주간 일정(MentorSchedule)도 함께 설정됨 */}
      <div
        role="group"
        aria-labelledby="contract-work-label"
        className="flex flex-col gap-x3 rounded-r3 border border-stroke-neutral-muted bg-bg-layer-default p-x4"
      >
        <div className="flex flex-wrap items-center justify-between gap-x2">
          <p id="contract-work-label" className="t4-medium text-fg-neutral">근무 요일 · 시간</p>
          <span className="t3-regular text-fg-neutral-subtle">주간 근무 일정에도 반영돼요</span>
        </div>
        <div className="flex flex-wrap gap-x1_5">
          {DOW.map((label, d) => {
            const on = workDays.includes(d);
            const weekend = d === 0 || d === 6;
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                disabled={isPending}
                aria-pressed={on}
                className={cn(
                  "grid size-x9 place-items-center rounded-full t4-medium transition-colors disabled:opacity-50",
                  on
                    ? "bg-bg-neutral-inverted text-fg-neutral-inverted"
                    : cn(
                        "bg-bg-layer-default shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed",
                        weekend ? "text-fg-critical" : "text-fg-neutral-muted",
                      ),
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x2">
          <TimePickerInput value={workStart} onChange={setWorkStart} disabled={isPending} />
          <span className="t4-regular text-fg-neutral-subtle">~</span>
          <TimePickerInput value={workEnd} onChange={setWorkEnd} disabled={isPending} />
        </div>
        {workDays.length === 0 && (
          <p className="t3-regular text-fg-neutral-subtle">요일을 고르지 않으면 근무 일정은 바뀌지 않아요.</p>
        )}
      </div>

      <FormField label="비고" htmlFor="contract-note">
        <Textarea
          id="contract-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="선택 · 예: 2026-06 시급 인상"
          disabled={isPending}
        />
      </FormField>

      <FormActions className="pt-0">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isPending}
        >
          취소
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={isPending}>
          {isPending ? "등록 중…" : "계약 등록"}
        </Button>
      </FormActions>
    </div>
  );
}
