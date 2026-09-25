"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Settings2, Loader2, Check, Lock, Users } from "lucide-react";
import {
  getMonthlyWorkSheet,
  setStaffWorkHour,
  setStaffMonthExtra,
  ownerConfirmWorkMonth,
  listContracts,
  type MonthlyWorkSheet as MonthlyWorkSheetData,
  type WorkSheetUser,
} from "@/actions/payroll";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, Section, StatCard, StatCards, StatusBadge } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { cn } from "@/lib/utils";
import { ContractHistoryDialog } from "./contract-history-dialog";
import { MonthStepper } from "./month-stepper";
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

// 근무시간 칸 입력 — 스프레드시트처럼 테두리 없이, 포커스 때만 SEED 포커스 테두리
const CELL_INPUT =
  "h-9 w-full bg-transparent px-x1 text-center t4-regular tabular-nums text-fg-neutral outline-none transition-shadow " +
  "placeholder:text-fg-placeholder focus:bg-bg-layer-default focus:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)] " +
  "disabled:cursor-not-allowed disabled:text-fg-neutral-subtle " +
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

// 표 칸 공통 선
const GRID = "border-b border-r border-stroke-neutral-muted";

function cellKey(userId: string, day: number) {
  return `${userId}__${day}`;
}

/** 급여 기준이 아직 없는 근무자 */
function rateUnset(u: WorkSheetUser) {
  return u.hourlyRate === 0 && u.monthlySalary == null;
}

export function MonthlyWorkSheet({ initial }: { initial: MonthlyWorkSheetData }) {
  const [sheet, setSheet] = useState<MonthlyWorkSheetData>(initial);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [cells, setCells] = useState<Record<string, string>>(() => buildCells(initial));
  const [extras, setExtras] = useState<Record<string, string>>(() => buildExtras(initial));
  const [pending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // 사업자 확인(확정/해제) 확인 다이얼로그 대상
  const [confirmTarget, setConfirmTarget] = useState<WorkSheetUser | null>(null);

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

  // 확인은 ConfirmDialog 에서 받는다
  function toggleOwnerConfirm(u: WorkSheetUser) {
    const next = u.ownerConfirmedAt == null;
    startTransition(async () => {
      try {
        await ownerConfirmWorkMonth(u.userId, year, month, next);
        await reload(year, month);
        toast.success(next ? `${u.name} 사업자 확인` : `${u.name} 확인 해제`);
        setConfirmTarget(null);
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

  // 요약 지표 (표시용 합계)
  const sumMinutes = users.reduce((s, u) => s + u.pay.totalMinutes, 0);
  const sumBase = users.reduce((s, u) => s + (u.pay.isMonthly ? 0 : u.pay.baseWage), 0);
  const sumHoliday = users.reduce((s, u) => s + (u.pay.isMonthly ? 0 : u.pay.weeklyHolidayWage), 0);
  const sumWage = users.reduce((s, u) => s + (rateUnset(u) ? 0 : u.pay.totalWage), 0);
  const ownerConfirmedCount = users.filter((u) => u.ownerConfirmedAt != null).length;
  const staffConfirmedCount = users.filter((u) => u.staffConfirmedAt != null).length;
  const unsetCount = users.filter(rateUnset).length;

  const confirmNext = confirmTarget ? confirmTarget.ownerConfirmedAt == null : true;

  return (
    <div className="flex flex-col gap-x6">
      {/* 월 선택 */}
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
        {users.length > 0 && (
          <p className="t3-regular text-fg-neutral-subtle">
            칸에 시간(예 7.5)을 입력하고 밖을 누르면 저장돼요
          </p>
        )}
      </div>

      {users.length === 0 ? (
        <Section>
          <EmptyState
            icon={Users}
            title="이 달에 표시할 근무자가 없어요"
            description="재직 중인 직원이나 이 달 근무 기록이 있는 직원이 여기에 나타나요."
            action={
              <Button asChild variant="outline">
                <Link href="/mentors">직원 관리로 가기</Link>
              </Button>
            }
          />
        </Section>
      ) : (
        <>
          <StatCards cols={4}>
            <StatCard label="근무자" value={users.length} unit="명" sub={unsetCount > 0 ? `급여 기준 미설정 ${unsetCount}명` : undefined} />
            <StatCard label="총 근무시간" value={minutesToHoursLabel(sumMinutes)} unit="시간" />
            <StatCard label="총 지급 예정(세전)" value={sumWage.toLocaleString("ko-KR")} unit="원" />
            <StatCard
              label="사업자 확인"
              value={`${ownerConfirmedCount}/${users.length}`}
              unit="명"
              tone={ownerConfirmedCount === users.length ? "ok" : "gray"}
              sub={`근무자 본인 확인 ${staffConfirmedCount}명`}
            />
          </StatCards>

          {/* 근무시간 표 */}
          <Section
            title="근무시간표"
            description="근무자가 입력한 시간을 확인하고 고칠 수 있어요. 사업자 확인을 하면 그 달은 잠겨요."
            flush
          >
            <div className="overflow-x-auto border-t border-stroke-neutral-muted">
              <table className="w-full border-collapse t4-regular text-fg-neutral tabular-nums">
                <thead>
                  <tr className="bg-bg-layer-fill">
                    <th
                      scope="col"
                      className={cn(GRID, "sticky left-0 z-10 w-20 bg-bg-layer-fill px-x3 py-x2_5 text-left t3-medium text-fg-neutral-subtle")}
                    >
                      날짜
                    </th>
                    {users.map((u) => (
                      <th key={u.userId} scope="col" className={cn(GRID, "min-w-24 px-x2 py-x2_5 text-center")}>
                        <div className="flex items-center justify-center gap-x1 t4-bold text-fg-neutral">
                          {u.name}
                          {userLocked(u) && <Lock className="size-3.5 text-fg-positive" aria-label="확정됨" />}
                        </div>
                        <div className="t2-regular text-fg-neutral-subtle">
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
                      <tr key={day} className={weekend ? "bg-bg-layer-fill" : undefined}>
                        <th
                          scope="row"
                          className={cn(
                            GRID,
                            "sticky left-0 z-10 px-x3 py-0 text-left t3-regular tabular-nums",
                            weekend ? "bg-bg-layer-fill text-fg-critical" : "bg-bg-layer-default text-fg-neutral-muted",
                          )}
                        >
                          {pad(day)} {WEEKDAYS[dow]}
                        </th>
                        {users.map((u) => {
                          const key = cellKey(u.userId, day);
                          const locked = userLocked(u);
                          return (
                            <td key={key} className={cn(GRID, "p-0")}>
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
                                  aria-label={`${u.name} ${month}월 ${day}일 근무시간`}
                                  className={CELL_INPUT}
                                />
                                {savingKey === key && (
                                  <Loader2 className="absolute right-1 top-1/2 size-3 -translate-y-1/2 animate-spin text-fg-neutral-subtle" />
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {/* 비고(추가근무) */}
                  <tr className="bg-bg-layer-fill">
                    <th
                      scope="row"
                      className={cn(GRID, "sticky left-0 z-10 bg-bg-layer-fill px-x3 py-0 text-left t3-medium text-fg-neutral-muted")}
                    >
                      비고(추가)
                    </th>
                    {users.map((u) => {
                      const key = `extra__${u.userId}`;
                      const locked = userLocked(u);
                      return (
                        <td key={key} className={cn(GRID, "p-0")}>
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
                              aria-label={`${u.name} 추가 근무시간`}
                              className={CELL_INPUT}
                            />
                            {savingKey === key && (
                              <Loader2 className="absolute right-1 top-1/2 size-3 -translate-y-1/2 animate-spin text-fg-neutral-subtle" />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>

                  {/* 총 근무시간 */}
                  <tr className="bg-bg-layer-fill">
                    <th
                      scope="row"
                      className={cn(GRID, "sticky left-0 z-10 bg-bg-layer-fill px-x3 py-x2_5 text-left t3-bold text-fg-neutral")}
                    >
                      총 근무시간
                    </th>
                    {users.map((u) => (
                      <td key={u.userId} className={cn(GRID, "px-x2 py-x2_5 text-center t4-bold tabular-nums text-fg-neutral")}>
                        {minutesToHoursLabel(u.pay.totalMinutes)}
                      </td>
                    ))}
                  </tr>

                  {/* 근무자 확인 */}
                  <tr>
                    <th
                      scope="row"
                      className={cn(GRID, "sticky left-0 z-10 bg-bg-layer-default px-x3 py-x2_5 text-left t3-medium text-fg-neutral-muted")}
                    >
                      근무자 확인
                    </th>
                    {users.map((u) => (
                      <td key={u.userId} className={cn(GRID, "px-x2 py-x2_5 text-center")}>
                        {u.staffConfirmedAt ? (
                          <Check className="mx-auto size-4 text-fg-positive" aria-label="본인 확인 완료" />
                        ) : (
                          <span className="t3-regular text-fg-placeholder">미확인</span>
                        )}
                      </td>
                    ))}
                  </tr>

                  {/* 사업자 확인 (확인 다이얼로그 후 토글) */}
                  <tr>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-r border-stroke-neutral-muted bg-bg-layer-default px-x3 py-x2_5 text-left t3-medium text-fg-neutral-muted"
                    >
                      사업자 확인
                    </th>
                    {users.map((u) => (
                      <td key={u.userId} className="border-r border-stroke-neutral-muted px-x2 py-x2 text-center">
                        {u.ownerConfirmedAt ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="secondary"
                            onClick={() => setConfirmTarget(u)}
                            disabled={pending}
                            className="bg-bg-positive-weak text-fg-positive hover:bg-bg-positive-weak-pressed"
                            title="확인 해제"
                          >
                            <Lock />
                            확정됨
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => setConfirmTarget(u)}
                            disabled={pending}
                            title="사업자 확인"
                          >
                            <Check />
                            확인
                          </Button>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {/* 월 급여 산정 (같은 화면) */}
          <Section
            title="월 급여 산정"
            description="세전 금액이에요. 시급제는 근무시간×시급 + 주휴수당(주 15시간 이상), 월급제는 고정 월급으로 계산해요."
            flush
          >
            <div className="border-t border-stroke-neutral-muted">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-x5">근무자</TableHead>
                    <TableHead>급여 기준</TableHead>
                    <TableHead className="text-right">근무시간</TableHead>
                    <TableHead className="text-right">기본급</TableHead>
                    <TableHead className="text-right">주휴수당</TableHead>
                    <TableHead className="text-right">총 지급(세전)</TableHead>
                    <TableHead className="pr-x5 text-right">
                      <span className="sr-only">설정</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const unset = rateUnset(u);
                    return (
                      <TableRow key={u.userId}>
                        <TableCell className="pl-x5">
                          <div className="flex items-center gap-x1_5 whitespace-nowrap">
                            <span className="t4-medium text-fg-neutral">{u.name}</span>
                            <span className="t3-regular text-fg-neutral-subtle">{ROLE_LABEL[u.role] ?? u.role}</span>
                            {u.ownerConfirmedAt && (
                              <StatusBadge tone="ok">
                                <Lock />
                                확정
                              </StatusBadge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {unset ? (
                            <StatusBadge tone="warn">미설정</StatusBadge>
                          ) : u.pay.isMonthly ? (
                            <span className="text-fg-neutral-muted">월급 {formatWon(u.monthlySalary ?? 0)}</span>
                          ) : (
                            <span className="text-fg-neutral-muted">시급 {formatWon(u.hourlyRate)}</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {minutesToHoursLabel(u.pay.totalMinutes)}시간
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {unset || u.pay.isMonthly ? <span className="text-fg-placeholder">—</span> : formatWon(u.pay.baseWage)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {unset || u.pay.isMonthly ? (
                            <span className="text-fg-placeholder">—</span>
                          ) : u.weeklyHolidayPay ? (
                            formatWon(u.pay.weeklyHolidayWage)
                          ) : (
                            <span className="text-fg-neutral-subtle">미지급</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right t4-bold">
                          {unset ? <span className="t4-regular text-fg-placeholder">—</span> : formatWon(u.pay.totalWage)}
                        </TableCell>
                        <TableCell className="pr-x5 text-right">
                          <Button
                            type="button"
                            size="xs"
                            variant={unset ? "default" : "outline"}
                            onClick={() => openRateDialog(u)}
                          >
                            <Settings2 />
                            급여 기준
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="pl-x5 t4-bold" colSpan={2}>
                      합계
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">{minutesToHoursLabel(sumMinutes)}시간</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{formatWon(sumBase)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{formatWon(sumHoliday)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right t4-bold">{formatWon(sumWage)}</TableCell>
                    <TableCell className="pr-x5" />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
            <p className="border-t border-stroke-neutral-muted px-x5 py-x3 t3-regular text-fg-neutral-subtle">
              실제 지급액은 세금·4대보험 공제 후 명세서를 확인하세요.
            </p>
          </Section>
        </>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmTarget(null);
        }}
        title={
          confirmNext
            ? `${confirmTarget?.name ?? ""}님의 ${month}월 근무를 확정할까요?`
            : `${confirmTarget?.name ?? ""}님의 ${month}월 확정을 풀까요?`
        }
        description={
          confirmNext
            ? "확정하면 이 달 근무시간을 더 고칠 수 없어요. 필요하면 나중에 확인을 해제할 수 있어요."
            : "해제하면 근무자와 관리자가 다시 근무시간을 고칠 수 있어요."
        }
        confirmLabel={confirmNext ? "사업자 확인" : "확인 해제"}
        pending={pending}
        onConfirm={() => confirmTarget && toggleOwnerConfirm(confirmTarget)}
      >
        {confirmTarget && confirmNext && (
          <dl className="grid grid-cols-2 gap-x3 rounded-r3 bg-bg-layer-fill px-x4 py-x3">
            <div>
              <dt className="t3-medium text-fg-neutral-subtle">총 근무시간</dt>
              <dd className="mt-x0_5 t5-bold tabular-nums text-fg-neutral">
                {minutesToHoursLabel(confirmTarget.pay.totalMinutes)}시간
              </dd>
            </div>
            <div>
              <dt className="t3-medium text-fg-neutral-subtle">총 지급(세전)</dt>
              <dd className="mt-x0_5 t5-bold tabular-nums text-fg-neutral">
                {rateUnset(confirmTarget) ? "급여 기준 미설정" : formatWon(confirmTarget.pay.totalWage)}
              </dd>
            </div>
          </dl>
        )}
      </ConfirmDialog>

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
