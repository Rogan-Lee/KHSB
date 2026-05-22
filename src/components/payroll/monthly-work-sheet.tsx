"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Settings2, Loader2, Check, Lock } from "lucide-react";
import {
  getMonthlyWorkSheet,
  setStaffWorkHour,
  setStaffMonthExtra,
  ownerConfirmWorkMonth,
  listContracts,
  type MonthlyWorkSheet as MonthlyWorkSheetData,
  type WorkSheetUser,
} from "@/actions/payroll";
import { ContractHistoryDialog } from "./contract-history-dialog";
import type { PayrollContract } from "@/generated/prisma";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function formatWon(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}
function minutesToHoursValue(min: number): string {
  if (!min) return "";
  const h = min / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
function minutesToHoursLabel(min: number): string {
  if (!min) return "0";
  const h = min / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "총괄",
  DIRECTOR: "원장",
  HEAD_MENTOR: "수석멘토",
  MENTOR: "멘토",
  STAFF: "직원",
};

function cellKey(userId: string, day: number) {
  return `${userId}__${day}`;
}

export function MonthlyWorkSheet({ initial }: { initial: MonthlyWorkSheetData }) {
  const [sheet, setSheet] = useState<MonthlyWorkSheetData>(initial);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [cells, setCells] = useState<Record<string, string>>(() => buildCells(initial));
  const [extras, setExtras] = useState<Record<string, string>>(() => buildExtras(initial));
  const [pending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // 급여 기준(계약) 다이얼로그
  const [rateTarget, setRateTarget] = useState<{ userId: string; userName: string } | null>(null);
  const [contracts, setContracts] = useState<PayrollContract[]>([]);

  const days = Array.from({ length: sheet.daysInMonth }, (_, i) => i + 1);

  function applySheet(next: MonthlyWorkSheetData) {
    setSheet(next);
    setCells(buildCells(next));
    setExtras(buildExtras(next));
  }

  async function reload(y: number, m: number) {
    try {
      const next = await getMonthlyWorkSheet(y, m);
      applySheet(next);
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
    startTransition(() => reload(y, m));
  }

  function userLocked(u: WorkSheetUser) {
    return u.ownerConfirmedAt != null;
  }

  function saveCell(u: WorkSheetUser, day: number) {
    if (userLocked(u)) return;
    const key = cellKey(u.userId, day);
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    const raw = (cells[key] ?? "").trim();
    const hours = raw === "" ? 0 : Number(raw);
    if (raw !== "" && (!Number.isFinite(hours) || hours < 0 || hours > 24)) {
      toast.error("0~24 사이 숫자를 입력하세요");
      return;
    }
    const existing = u.days.find((d) => d.date === dateStr)?.minutes ?? 0;
    if (Math.round(hours * 60) === existing) return;

    setSavingKey(key);
    startTransition(async () => {
      try {
        await setStaffWorkHour(u.userId, dateStr, hours);
        await reload(year, month);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      } finally {
        setSavingKey(null);
      }
    });
  }

  function saveExtra(u: WorkSheetUser) {
    if (userLocked(u)) return;
    const key = `extra__${u.userId}`;
    const raw = (extras[u.userId] ?? "").trim();
    const hours = raw === "" ? 0 : Number(raw);
    if (raw !== "" && (!Number.isFinite(hours) || hours < 0 || hours > 24)) {
      toast.error("0~24 사이 숫자를 입력하세요");
      return;
    }
    if (Math.round(hours * 60) === u.extraMinutes) return;
    setSavingKey(key);
    startTransition(async () => {
      try {
        await setStaffMonthExtra(u.userId, year, month, hours);
        await reload(year, month);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      } finally {
        setSavingKey(null);
      }
    });
  }

  function toggleOwnerConfirm(u: WorkSheetUser) {
    const next = u.ownerConfirmedAt == null;
    startTransition(async () => {
      try {
        await ownerConfirmWorkMonth(u.userId, year, month, next);
        await reload(year, month);
        toast.success(next ? `${u.name} 사업자 확인` : `${u.name} 확인 해제`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  function openRateDialog(u: WorkSheetUser) {
    setRateTarget({ userId: u.userId, userName: u.name });
    setContracts([]);
    listContracts(u.userId)
      .then(setContracts)
      .catch(() => toast.error("계약 이력을 불러오지 못했습니다"));
  }

  const users = sheet.users;

  return (
    <div className="space-y-5">
      {/* 월 선택 */}
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
          <span className="min-w-[96px] text-center text-[16px] font-bold tabular-nums">
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

      {users.length === 0 ? (
        <p className="rounded-md bg-panel-2 px-3 py-8 text-center text-sm text-ink-4">
          이 달에 표시할 근무자가 없습니다.
        </p>
      ) : (
        <>
          {/* 근무시간 표 (사진 재현) */}
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-panel-2">
                  <th className="sticky left-0 z-10 w-[72px] border-b border-r border-line-2 bg-panel-2 px-2 py-2 text-left text-[11px] font-semibold text-ink-4">
                    날짜
                  </th>
                  {users.map((u) => (
                    <th
                      key={u.userId}
                      className="min-w-[84px] border-b border-r border-line-2 px-2 py-2 text-center"
                    >
                      <div className="text-[12.5px] font-bold text-ink">{u.name}</div>
                      <div className="text-[10px] text-ink-4">
                        {ROLE_LABEL[u.role] ?? u.role}
                        {u.status !== "ACTIVE" && " · 퇴사"}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const dow = new Date(year, month - 1, day).getDay();
                  const weekend = dow === 0 || dow === 6;
                  return (
                    <tr key={day} className={weekend ? "bg-bad/5" : ""}>
                      <td
                        className={`sticky left-0 z-10 border-b border-r border-line-2 px-2 py-1 text-[12px] tabular-nums ${
                          weekend ? "bg-[#fdf2f2] text-bad" : "bg-panel text-ink-3"
                        }`}
                      >
                        {pad(day)} {WEEKDAYS[dow]}
                      </td>
                      {users.map((u) => {
                        const key = cellKey(u.userId, day);
                        const locked = userLocked(u);
                        return (
                          <td key={key} className="border-b border-r border-line-2 p-0">
                            <div className="relative">
                              <input
                                type="number"
                                inputMode="decimal"
                                step="0.25"
                                min="0"
                                max="24"
                                disabled={locked || pending}
                                value={cells[key] ?? ""}
                                onChange={(e) => setCells((p) => ({ ...p, [key]: e.target.value }))}
                                onBlur={() => saveCell(u, day)}
                                className="h-8 w-full bg-transparent px-1 text-center text-[13px] tabular-nums focus:bg-brand/5 focus:outline-none disabled:text-ink-4"
                              />
                              {savingKey === key && (
                                <Loader2 className="absolute right-0.5 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-ink-4" />
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* 비고(추가근무) */}
                <tr className="bg-panel-2">
                  <td className="sticky left-0 z-10 border-b border-r border-line-2 bg-panel-2 px-2 py-1 text-[11px] font-semibold text-ink-4">
                    비고(추가)
                  </td>
                  {users.map((u) => {
                    const key = `extra__${u.userId}`;
                    const locked = userLocked(u);
                    return (
                      <td key={key} className="border-b border-r border-line-2 p-0">
                        <div className="relative">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.25"
                            min="0"
                            max="24"
                            disabled={locked || pending}
                            value={extras[u.userId] ?? ""}
                            onChange={(e) => setExtras((p) => ({ ...p, [u.userId]: e.target.value }))}
                            onBlur={() => saveExtra(u)}
                            className="h-8 w-full bg-transparent px-1 text-center text-[13px] tabular-nums focus:bg-brand/5 focus:outline-none disabled:text-ink-4"
                          />
                          {savingKey === key && (
                            <Loader2 className="absolute right-0.5 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-ink-4" />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* 총 근무시간 */}
                <tr className="bg-brand/5 font-semibold">
                  <td className="sticky left-0 z-10 border-b border-r border-line-2 bg-brand/5 px-2 py-1.5 text-[11px] text-ink-3">
                    총 근무시간
                  </td>
                  {users.map((u) => (
                    <td
                      key={u.userId}
                      className="border-b border-r border-line-2 px-1 py-1.5 text-center text-[13px] tabular-nums text-ink"
                    >
                      {minutesToHoursLabel(u.pay.totalMinutes)}
                    </td>
                  ))}
                </tr>

                {/* 근무자 확인 */}
                <tr>
                  <td className="sticky left-0 z-10 border-b border-r border-line-2 bg-panel px-2 py-1.5 text-[11px] text-ink-4">
                    근무자 확인
                  </td>
                  {users.map((u) => (
                    <td key={u.userId} className="border-b border-r border-line-2 px-1 py-1.5 text-center">
                      {u.staffConfirmedAt ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-600" />
                      ) : (
                        <span className="text-ink-5">·</span>
                      )}
                    </td>
                  ))}
                </tr>

                {/* 사업자 확인 (토글) */}
                <tr>
                  <td className="sticky left-0 z-10 border-r border-line-2 bg-panel px-2 py-1.5 text-[11px] text-ink-4">
                    사업자 확인
                  </td>
                  {users.map((u) => (
                    <td key={u.userId} className="border-r border-line-2 px-1 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => toggleOwnerConfirm(u)}
                        disabled={pending}
                        title={u.ownerConfirmedAt ? "확인 해제" : "사업자 확인"}
                        className={`mx-auto grid h-6 w-6 place-items-center rounded disabled:opacity-50 ${
                          u.ownerConfirmedAt
                            ? "bg-emerald-600 text-white"
                            : "border border-line text-ink-4 hover:bg-panel-2"
                        }`}
                      >
                        {u.ownerConfirmedAt ? <Lock className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* 월 급여 산정 (같은 화면) */}
          <div>
            <h3 className="mb-2 text-[13px] font-bold text-ink">월 급여 산정 (세전)</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {users.map((u) => (
                <div key={u.userId} className="rounded-xl border border-line p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-bold text-ink">{u.name}</span>
                      <span className="text-[11px] text-ink-4">{ROLE_LABEL[u.role] ?? u.role}</span>
                      {u.ownerConfirmedAt && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1 text-[10px] text-emerald-700">
                          <Lock className="h-2.5 w-2.5" /> 확정
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openRateDialog(u)}
                      className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-ink-3 hover:bg-panel-2"
                    >
                      <Settings2 className="h-3 w-3" /> 급여 기준
                    </button>
                  </div>

                  {u.hourlyRate === 0 && u.monthlySalary == null ? (
                    <p className="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
                      급여 기준(시급/월급) 미설정 — &quot;급여 기준&quot;에서 계약을 등록하세요.
                    </p>
                  ) : (
                    <div className="space-y-1 text-[12px]">
                      <Row
                        label={u.pay.isMonthly ? "월 기본급" : "시급"}
                        value={u.pay.isMonthly ? formatWon(u.monthlySalary ?? 0) : formatWon(u.hourlyRate)}
                      />
                      <Row label="총 근무시간" value={`${minutesToHoursLabel(u.pay.totalMinutes)}시간`} />
                      {!u.pay.isMonthly && (
                        <>
                          <Row label="기본급" value={formatWon(u.pay.baseWage)} />
                          <Row
                            label="주휴수당"
                            value={u.weeklyHolidayPay ? formatWon(u.pay.weeklyHolidayWage) : "미지급"}
                          />
                        </>
                      )}
                      <div className="mt-1 flex items-center justify-between border-t border-line-2 pt-1">
                        <span className="text-[12px] font-semibold text-ink-3">총 지급(세전)</span>
                        <span className="text-[15px] font-bold tabular-nums text-ink">
                          {formatWon(u.pay.totalWage)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-4">
              ※ 세전 금액입니다. 시급제는 근무시간×시급 + 주휴수당(주 15시간↑), 월급제는 고정 월급으로 산정합니다.
              실제 지급액은 세금·4대보험 공제 후 명세서를 확인하세요.
            </p>
          </div>
        </>
      )}

      {rateTarget && (
        <ContractHistoryDialog
          open={!!rateTarget}
          onOpenChange={(o) => {
            if (!o) setRateTarget(null);
          }}
          userId={rateTarget.userId}
          userName={rateTarget.userName}
          contracts={contracts}
          onChanged={() => {
            listContracts(rateTarget.userId).then(setContracts).catch(() => {});
            reload(year, month);
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-4">{label}</span>
      <span className="tabular-nums font-medium text-ink-2">{value}</span>
    </div>
  );
}

function buildCells(sheet: MonthlyWorkSheetData): Record<string, string> {
  const map: Record<string, string> = {};
  for (const u of sheet.users) {
    for (const d of u.days) {
      const day = Number(d.date.slice(8, 10));
      map[cellKey(u.userId, day)] = minutesToHoursValue(d.minutes);
    }
  }
  return map;
}

function buildExtras(sheet: MonthlyWorkSheetData): Record<string, string> {
  const map: Record<string, string> = {};
  for (const u of sheet.users) {
    map[u.userId] = minutesToHoursValue(u.extraMinutes);
  }
  return map;
}
