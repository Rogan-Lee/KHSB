"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Lock, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Notice, Section, StatCard, StatCards, StatusBadge } from "@/components/backoffice/ui";
import {
  getMyWorkSheet,
  setMyWorkHour,
  setMyMonthExtra,
  confirmMyWorkMonth,
  type WorkSheetUser,
} from "@/actions/payroll";
import { MonthStepper } from "./month-stepper";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function formatWon(n: number) {
  return n.toLocaleString("ko-KR");
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

// 숫자 입력 — SEED TextInput 규격, 스핀 버튼 숨김
const HOUR_INPUT =
  "w-full rounded-r2 border-0 bg-bg-layer-default text-center tabular-nums text-fg-neutral outline-none transition-shadow " +
  "shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] placeholder:text-fg-placeholder " +
  "focus-visible:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)] " +
  "disabled:cursor-not-allowed disabled:bg-bg-disabled disabled:text-fg-disabled " +
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

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
  // 1일의 요일(0=일 ~ 6=토) — 캘린더 선행 빈 칸 계산용
  const firstDow = useMemo(() => new Date(year, month - 1, 1).getDay(), [year, month]);

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
  const staffConfirmed = sheet.staffConfirmedAt != null;

  return (
    <div className="flex flex-col gap-x6">
      {/* 월 선택 + 상태 */}
      <div className="flex flex-wrap items-center justify-between gap-x3">
        <MonthStepper
          year={year}
          month={month}
          onPrev={() => changeMonth(-1)}
          onNext={() => changeMonth(1)}
          disabled={pending}
          loading={pending}
          className="-ml-2"
        />
        {locked ? (
          <StatusBadge tone="ok" size="large">
            <Lock />
            원장 확인 완료
          </StatusBadge>
        ) : staffConfirmed ? (
          <StatusBadge tone="info" size="large">
            <Check />
            본인 확인 완료
          </StatusBadge>
        ) : (
          <StatusBadge tone="gray" size="large">입력 중</StatusBadge>
        )}
      </div>

      {/* 급여 요약 */}
      <div className="flex flex-col gap-x2">
        <StatCards cols={pay.isMonthly ? 3 : 4}>
          <StatCard label="총 근무시간" value={minutesToHoursLabel(pay.totalMinutes)} />
          <StatCard
            label={pay.isMonthly ? "월 기본급" : "시급"}
            value={pay.isMonthly ? formatWon(sheet.monthlySalary ?? 0) : formatWon(sheet.hourlyRate)}
            unit="원"
          />
          {!pay.isMonthly && <StatCard label="주휴수당" value={formatWon(pay.weeklyHolidayWage)} unit="원" />}
          <StatCard label="총 지급(세전)" value={formatWon(pay.totalWage)} unit="원" tone="brand" />
        </StatCards>
        <p className="t3-regular text-fg-neutral-subtle">
          세전 금액이에요. 실제 지급액은 세금·공제가 반영된 명세서를 확인하세요.
        </p>
      </div>

      {/* 잠금/확인 안내 */}
      {locked ? (
        <Notice tone="warn" icon={Lock}>
          원장 확인이 완료된 달이에요. 고쳐야 할 게 있으면 원장님께 문의하세요.
        </Notice>
      ) : (
        <div className="flex flex-col gap-x3 rounded-r4 bg-bg-layer-fill px-x5 py-x4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="t5-bold text-fg-neutral">
              {staffConfirmed ? "이번 달 본인 확인을 마쳤어요" : "이번 달 입력을 마쳤나요?"}
            </p>
            <p className="mt-x0_5 t4-regular text-fg-neutral-subtle">
              {staffConfirmed
                ? "고칠 게 생기면 확인을 해제하고 다시 입력하세요."
                : "근무시간을 모두 입력했다면 본인 확인을 눌러주세요."}
            </p>
          </div>
          <Button
            type="button"
            onClick={toggleConfirm}
            disabled={pending}
            variant={staffConfirmed ? "secondary" : "default"}
            className="w-full sm:w-auto"
          >
            <Check />
            {staffConfirmed ? "본인 확인 해제" : "이번 달 본인 확인"}
          </Button>
        </div>
      )}

      {/* 일자별 입력 — 월간 캘린더 그리드 */}
      <Section
        title="일별 근무시간"
        description="시간 단위로 입력하고(예 7.5) 칸 밖을 누르면 저장돼요."
      >
        {/* 요일 헤더 */}
        <div className="mb-x1_5 grid grid-cols-7 gap-x1">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={cn(
                "py-x1 text-center t3-medium",
                i === 0 || i === 6 ? "text-fg-critical" : "text-fg-neutral-subtle",
              )}
            >
              {w}
            </div>
          ))}
        </div>
        {/* 날짜 칸 */}
        <div className="grid grid-cols-7 gap-x1">
          {/* 1일 앞 빈 칸 */}
          {Array.from({ length: firstDow }, (_, i) => (
            <div key={`pad-${i}`} aria-hidden />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const dateStr = `${year}-${pad(month)}-${pad(day)}`;
            const dow = new Date(year, month - 1, day).getDay();
            const isWeekend = dow === 0 || dow === 6;
            const hasValue = (inputs[dateStr] ?? "").trim() !== "";
            return (
              <div
                key={dateStr}
                className={cn(
                  "flex flex-col gap-x1 rounded-r2 p-x1 sm:p-x1_5",
                  hasValue ? "bg-bg-brand-weak" : "bg-bg-layer-fill",
                )}
              >
                <div className="flex h-4 items-center justify-between px-x0_5">
                  <span
                    className={cn(
                      "t2-medium tabular-nums",
                      isWeekend ? "text-fg-critical" : hasValue ? "text-fg-brand" : "text-fg-neutral-subtle",
                    )}
                  >
                    {day}
                  </span>
                  {savingKey === dateStr && <Loader2 className="size-3 animate-spin text-fg-neutral-subtle" aria-label="저장 중" />}
                </div>
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
                  aria-label={`${month}월 ${day}일 근무시간`}
                  className={cn(HOUR_INPUT, "h-9 px-x0_5 t5-medium")}
                />
              </div>
            );
          })}
        </div>
        {/* 월 합계 */}
        <div className="mt-x4 flex items-center justify-between border-t border-stroke-neutral-muted pt-x3">
          <span className="t4-regular text-fg-neutral-subtle">이번 달 합계</span>
          <span className="t5-bold tabular-nums text-fg-neutral">
            {minutesToHoursLabel(pay.totalMinutes)}
          </span>
        </div>
      </Section>

      {/* 비고(추가근무) */}
      <Section title="추가 근무" description="회의처럼 날짜별 칸에 넣기 어려운 근무 시간을 적어요.">
        <label htmlFor="my-extra-hours" className="sr-only">추가 근무시간</label>
        <div className="flex items-center gap-x2">
          <input
            id="my-extra-hours"
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
            className={cn(HOUR_INPUT, "h-10 w-32 px-x3 t5-regular")}
          />
          <span className="t4-regular text-fg-neutral-subtle">시간</span>
          {savingKey === "extra" && <Loader2 className="size-4 animate-spin text-fg-neutral-subtle" aria-label="저장 중" />}
        </div>
      </Section>
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
