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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createContract } from "@/actions/payroll";
import { MIN_HOURLY_WAGE_2026 } from "@/lib/payroll";
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
  return `₩${n.toLocaleString("ko-KR")}`;
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function formatWorkSchedule(days: number[], start: string | null, end: string | null): string | null {
  if (!days || days.length === 0 || !start || !end) return null;
  const labels = [...days].sort((a, b) => a - b).map((d) => DOW[d]).join("·");
  return `${labels} ${start}~${end}`;
}

/**
 * 근무자별 PayrollContract 이력 + 신규 계약 입력 다이얼로그.
 * Sprint 3 PR 3.2 — 아직 어떤 페이지에도 wire-up 되지 않음. PR 3.3 에서 admin board sheet 가 사용 예정.
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{userName} — 급여 계약 이력</DialogTitle>
          <DialogDescription>
            시급·주휴·고정 수당 계약 버전. 신규 계약을 추가하면 직전 계약은 자동
            종료됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {sorted.length === 0 ? (
            <p className="rounded-md bg-muted px-3 py-6 text-center text-sm text-muted-foreground">
              계약 이력이 없습니다. 신규 계약을 추가하세요.
            </p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((c) => {
                const isActive = c.effectiveTo === null;
                return (
                  <li
                    key={c.id}
                    className={
                      isActive
                        ? "rounded-md border border-green-300 bg-green-50 px-3 py-2 dark:bg-green-950/30"
                        : "rounded-md border bg-card px-3 py-2"
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">
                        {formatYmd(c.effectiveFrom)} ~{" "}
                        {formatYmd(c.effectiveTo)}
                      </div>
                      {isActive && (
                        <Badge variant="default" className="bg-green-600">
                          활성
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {c.monthlySalary != null && c.monthlySalary > 0 ? (
                        <span className="font-medium text-foreground">월급 {formatWon(c.monthlySalary)}</span>
                      ) : (
                        <span>시급 {formatWon(c.hourlyRate)}</span>
                      )}
                      <span>
                        주휴 {c.weeklyHolidayPay ? "ON" : "OFF"}
                      </span>
                      {c.monthlyBonusKrw > 0 && (
                        <span>보너스 {formatWon(c.monthlyBonusKrw)}</span>
                      )}
                      {formatWorkSchedule(c.workDays, c.workStartTime, c.workEndTime) && (
                        <span className="text-foreground/70">
                          근무 {formatWorkSchedule(c.workDays, c.workStartTime, c.workEndTime)}
                        </span>
                      )}
                    </div>
                    {c.note && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {c.note}
                      </div>
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
            <div className="pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(true)}
              >
                + 신규 계약
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            닫기
          </Button>
        </DialogFooter>
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

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="text-sm font-medium">신규 계약</div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="contract-from">시작월</Label>
          <Input
            id="contract-from"
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">매월 1일로 적용됩니다</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="contract-rate">시급 (원)</Label>
          <Input
            id="contract-rate"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            placeholder="예: 12000"
            disabled={isPending}
          />
          {hourlyRate.trim() !== "" &&
            Number(hourlyRate) > 0 &&
            Number(hourlyRate) < MIN_HOURLY_WAGE_2026 && (
              <p className="text-xs text-amber-600">
                ⚠️ 2026년 최저임금({MIN_HOURLY_WAGE_2026.toLocaleString("ko-KR")}원) 미만입니다.
              </p>
            )}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="contract-salary">월 기본급 (원, 선택)</Label>
        <Input
          id="contract-salary"
          type="number"
          inputMode="numeric"
          min={0}
          step={10000}
          value={monthlySalary}
          onChange={(e) => setMonthlySalary(e.target.value)}
          placeholder="입력 시 시급 대신 고정 월급으로 정산"
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          비워두면 시급제(시간×시급+주휴). 입력하면 근무시간과 무관하게 고정 월급으로 정산됩니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 pt-5">
          <Checkbox
            id="contract-whp"
            checked={weeklyHolidayPay}
            onCheckedChange={(v) => setWeeklyHolidayPay(v === true)}
            disabled={isPending}
          />
          <Label htmlFor="contract-whp" className="text-sm">
            주휴수당 포함
          </Label>
        </div>
        <div className="space-y-1">
          <Label htmlFor="contract-bonus">고정 보너스 (원, 선택)</Label>
          <Input
            id="contract-bonus"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={monthlyBonus}
            onChange={(e) => setMonthlyBonus(e.target.value)}
            placeholder="예: 식대 100000"
            disabled={isPending}
          />
        </div>
      </div>

      {/* 근무 조건 — 계약 등록 시 주간 일정(MentorSchedule)도 함께 설정됨 */}
      <div className="space-y-2 rounded-md border bg-background p-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm">근무 요일 · 시간</Label>
          <span className="text-[11px] text-muted-foreground">주간 일정에도 반영됩니다</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DOW.map((label, d) => {
            const on = workDays.includes(d);
            const weekend = d === 0 || d === 6;
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                disabled={isPending}
                className={
                  on
                    ? "h-8 w-8 rounded-md bg-slate-900 text-sm font-medium text-white"
                    : `h-8 w-8 rounded-md border text-sm ${weekend ? "text-red-500" : "text-muted-foreground"} hover:bg-accent`
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} disabled={isPending} className="w-32" />
          <span className="text-muted-foreground text-sm">~</span>
          <Input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} disabled={isPending} className="w-32" />
        </div>
        {workDays.length === 0 && (
          <p className="text-[11px] text-muted-foreground">요일을 선택하지 않으면 근무 일정은 변경되지 않습니다.</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="contract-note">비고 (선택)</Label>
        <Textarea
          id="contract-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="예: 2026-06 시급 인상"
          disabled={isPending}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          취소
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={isPending}>
          {isPending ? "등록 중..." : "등록"}
        </Button>
      </div>
    </div>
  );
}
