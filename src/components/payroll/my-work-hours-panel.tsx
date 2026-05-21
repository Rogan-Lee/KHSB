"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Lock, Check, Loader2 } from "lucide-react";
import {
  getMyWorkSheet,
  setMyWorkHour,
  setMyMonthExtra,
  confirmMyWorkMonth,
  type WorkSheetUser,
} from "@/actions/payroll";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function formatWon(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}
function minutesToHoursLabel(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}
function minutesToHoursValue(min: number): string {
  if (!min) return "";
  const h = min / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function MyWorkHoursPanel({
  initial,
  year: initialYear,
  month: initialMonth,
}: {
  initial: WorkSheetUser;
  year: number;
  month: number;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [sheet, setSheet] = useState<WorkSheetUser>(initial);
  const [inputs, setInputs] = useState<Record<string, string>>(() => buildInputs(initial));
  const [extra, setExtra] = useState<string>(minutesToHoursValue(initial.extraMinutes));
  const [pending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const locked = sheet.ownerConfirmedAt != null;
  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);

  function buildInputsFor(s: WorkSheetUser) {
    return buildInputs(s);
  }

  async function reloadSheet(y: number, m: number) {
    try {
      const next = await getMyWorkSheet(y, m);
      setSheet(next);
      setInputs(buildInputsFor(next));
      setExtra(minutesToHoursValue(next.extraMinutes));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "불러오기 실패");
    }
  }

  function changeMonth(delta: number) {
    let y = year;
    let m = month + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setYear(y);
    setMonth(m);
    startTransition(() => reloadSheet(y, m));
  }

  function saveDay(day: number) {
    if (locked) return;
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    const raw = inputs[dateStr]?.trim() ?? "";
    const hours = raw === "" ? 0 : Number(raw);
    if (raw !== "" && (!Number.isFinite(hours) || hours < 0 || hours > 24)) {
      toast.error("0~24 사이 숫자를 입력하세요");
      return;
    }
    // 변경 없으면 스킵
    const existing = sheet.days.find((d) => d.date === dateStr)?.minutes ?? 0;
    if (Math.round(hours * 60) === existing) return;

    setSavingKey(dateStr);
    startTransition(async () => {
      try {
        await setMyWorkHour(dateStr, hours);
        await reloadSheet(year, month);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      } finally {
        setSavingKey(null);
      }
    });
  }

  function saveExtra() {
    if (locked) return;
    const raw = extra.trim();
    const hours = raw === "" ? 0 : Number(raw);
    if (raw !== "" && (!Number.isFinite(hours) || hours < 0 || hours > 24)) {
      toast.error("0~24 사이 숫자를 입력하세요");
      return;
    }
    if (Math.round(hours * 60) === sheet.extraMinutes) return;
    setSavingKey("extra");
    startTransition(async () => {
      try {
        await setMyMonthExtra(year, month, hours);
        await reloadSheet(year, month);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      } finally {
        setSavingKey(null);
      }
    });
  }

  function toggleConfirm() {
    const next = sheet.staffConfirmedAt == null;
    startTransition(async () => {
      try {
        await confirmMyWorkMonth(year, month, next);
        await reloadSheet(year, month);
        toast.success(next ? "본인 확인 완료" : "본인 확인 해제");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  const pay = sheet.pay;

  return (
    <div className="space-y-4">
      {/* 월 선택 + 요약 */}
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            disabled={pending}
            className="grid h-8 w-8 place-items-center rounded-md border border-line text-ink-3 hover:bg-panel-2 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[88px] text-center text-[15px] font-bold tabular-nums">
            {year}.{pad(month)}
          </span>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            disabled={pending}
            className="grid h-8 w-8 place-items-center rounded-md border border-line text-ink-3 hover:bg-panel-2 disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-ink-4" />}
      </div>

      {/* 급여 요약 카드 */}
      <div className="rounded-xl border border-line bg-panel-2 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="총 근무시간" value={minutesToHoursLabel(pay.totalMinutes)} />
          <Stat
            label={pay.isMonthly ? "월 기본급" : "시급"}
            value={pay.isMonthly ? formatWon(sheet.monthlySalary ?? 0) : formatWon(sheet.hourlyRate)}
          />
          {!pay.isMonthly && <Stat label="주휴수당" value={formatWon(pay.weeklyHolidayWage)} />}
          <Stat label="총 지급(세전)" value={formatWon(pay.totalWage)} strong />
        </div>
        <p className="mt-2 text-[11px] text-ink-4">
          ※ 세전 금액입니다. 실제 지급액은 세금·공제가 반영된 명세서를 확인하세요.
        </p>
      </div>

      {/* 잠금/확인 안내 */}
      {locked ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <Lock className="h-4 w-4 shrink-0" />
          원장 확인이 완료된 달입니다. 수정하려면 원장님께 문의하세요.
        </div>
      ) : (
        <button
          type="button"
          onClick={toggleConfirm}
          disabled={pending}
          className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold disabled:opacity-50 ${
            sheet.staffConfirmedAt
              ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
              : "bg-slate-900 text-white"
          }`}
        >
          <Check className="h-4 w-4" />
          {sheet.staffConfirmedAt ? "본인 확인 완료 (해제)" : "이번 달 본인 확인"}
        </button>
      )}

      {/* 일자별 입력 */}
      <div className="rounded-xl border border-line overflow-hidden">
        <div className="grid grid-cols-[64px_1fr_auto] items-center border-b border-line-2 bg-panel-2 px-3 py-2 text-[11px] font-semibold text-ink-4">
          <span>날짜</span>
          <span>근무시간 (시간 단위, 예 7.5)</span>
          <span></span>
        </div>
        <div className="max-h-[420px] overflow-y-auto divide-y divide-line-2">
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const dateStr = `${year}-${pad(month)}-${pad(day)}`;
            const dow = new Date(year, month - 1, day).getDay();
            const isWeekend = dow === 0 || dow === 6;
            return (
              <div key={dateStr} className="grid grid-cols-[64px_1fr_auto] items-center px-3 py-1.5">
                <span className={`text-[13px] tabular-nums ${isWeekend ? "text-bad" : "text-ink-3"}`}>
                  {pad(day)} {WEEKDAYS[dow]}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.25"
                  min="0"
                  max="24"
                  disabled={locked || pending}
                  value={inputs[dateStr] ?? ""}
                  onChange={(e) => setInputs((p) => ({ ...p, [dateStr]: e.target.value }))}
                  onBlur={() => saveDay(day)}
                  placeholder="-"
                  className="w-full rounded-md border border-line bg-panel px-2 py-1.5 text-[16px] tabular-nums focus:border-brand focus:outline-none disabled:bg-canvas-2 disabled:text-ink-4"
                />
                <span className="w-5 pl-1">
                  {savingKey === dateStr && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-4" />}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 비고(추가근무) */}
      <div className="rounded-xl border border-line p-3">
        <label className="mb-1 block text-[12px] font-semibold text-ink-3">비고 — 회의 등 추가근무 (시간)</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.25"
            min="0"
            max="24"
            disabled={locked || pending}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            onBlur={saveExtra}
            placeholder="0"
            className="w-32 rounded-md border border-line bg-panel px-2 py-1.5 text-[16px] tabular-nums focus:border-brand focus:outline-none disabled:bg-canvas-2 disabled:text-ink-4"
          />
          {savingKey === "extra" && <Loader2 className="h-4 w-4 animate-spin text-ink-4" />}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-ink-4">{label}</p>
      <p className={`tabular-nums ${strong ? "text-[15px] font-bold text-ink" : "text-[14px] font-semibold text-ink-2"}`}>
        {value}
      </p>
    </div>
  );
}

function buildInputs(s: WorkSheetUser): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of s.days) {
    map[d.date] = minutesToHoursValue(d.minutes);
  }
  return map;
}
