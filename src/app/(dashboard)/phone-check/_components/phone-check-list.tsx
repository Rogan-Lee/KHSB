"use client";

// 목록 보기 — 학생별로 제출·미제출·면제·미입실을 직접 고르는 표. 지난 날짜 수정·사유 입력용.

import { useMemo, useState } from "react";
import { Check, Loader2, SearchX, Smartphone } from "lucide-react";
import type { PhoneCheckStatus } from "@/generated/prisma";
import type { PhoneCheckRow } from "@/lib/phone-check-core";
import { useStickyState } from "@/hooks/use-sticky-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { inputBaseClass } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, FilterChip, SearchField, StatusBadge, TableCard, Toolbar } from "@/components/backoffice/ui";
import { STATUS_META, STATUSES, stateText } from "./meta";

export function PhoneCheckList({
  rows,
  pendingCount,
  busy,
  onSet,
  onBulk,
}: {
  rows: PhoneCheckRow[];
  /** 완료 때 기록될 학생 수 (자리에 있는데 기록 없음) */
  pendingCount: number;
  busy: boolean;
  onSet: (row: PhoneCheckRow, status: PhoneCheckStatus, note?: string) => void;
  onBulk: () => void;
}) {
  const [query, setQuery] = useStickyState("phone-check:query", "");
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!onlyUnchecked || (r.checkedIn && !r.record)) &&
        (!q || `${r.name} ${r.seat ?? ""}`.toLowerCase().includes(q)),
    );
  }, [query, rows, onlyUnchecked]);

  return (
    <div>
      <Toolbar>
        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          placeholder="이름 · 좌석 검색"
          aria-label="학생 검색"
          enterKeyHint="search"
          autoComplete="off"
        />
        <FilterChip
          selected={onlyUnchecked}
          count={pendingCount}
          onClick={() => setOnlyUnchecked((v) => !v)}
          className="h-9 px-x3_5 t4-medium"
        >
          확인 전만
        </FilterChip>
        <Button
          type="button"
          onClick={onBulk}
          disabled={busy || pendingCount === 0}
          className="w-full sm:ml-auto sm:w-auto"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Check />}
          자리에 있는 <span className="tabular-nums">{pendingCount}</span>명 제출 처리
        </Button>
      </Toolbar>

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center md:w-16">좌석</TableHead>
              <TableHead>이름</TableHead>
              <TableHead className="hidden w-20 md:table-cell">학년</TableHead>
              <TableHead className="hidden w-28 md:table-cell">입·퇴실</TableHead>
              <TableHead>검사 상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const st = r.record?.status ?? null;
              const unchecked = r.checkedIn && !r.record;
              return (
                <TableRow key={r.studentId}>
                  <TableCell className="text-center t5-bold tabular-nums">{r.seat ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-x-x2 gap-y-x0_5">
                      <span className="whitespace-nowrap t5-bold text-fg-neutral">{r.name}</span>
                      {unchecked && <StatusBadge tone="warn">확인 전</StatusBadge>}
                    </div>
                    {/* 휴대폰: 학년·입퇴실 칸 대신 이름 아래 한 줄 */}
                    <p className="mt-x0_5 t3-regular tabular-nums text-fg-neutral-subtle md:hidden">{stateText(r)}</p>
                  </TableCell>
                  <TableCell className="hidden t3-regular text-fg-neutral-muted md:table-cell">{r.grade}</TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">
                    {r.checkInAt ? (
                      `${r.checkInAt}${r.checkOutAt ? `~${r.checkOutAt}` : ""}`
                    ) : (
                      <span className="t3-regular text-fg-neutral-subtle">미입실</span>
                    )}
                  </TableCell>
                  <TableCell className="py-x2">
                    <div
                      className="grid grid-cols-2 gap-x1 md:flex md:flex-wrap md:items-center md:gap-x1_5"
                      role="group"
                      aria-label={`${r.name} 검사 상태`}
                    >
                      {STATUSES.map((s) => {
                        const meta = STATUS_META[s];
                        const Icon = meta.icon;
                        const selected = st === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => onSet(r, s)}
                            className={cn(
                              "inline-flex h-11 min-w-16 items-center justify-center gap-x1 whitespace-nowrap rounded-r2 px-x2 t3-medium transition-colors md:h-10 md:px-x3 md:t4-medium",
                              selected
                                ? meta.selected
                                : "bg-bg-layer-default text-fg-neutral-muted shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed",
                            )}
                          >
                            {selected && <Icon className="size-4" aria-hidden />}
                            {meta.label}
                          </button>
                        );
                      })}
                      {!st && !r.checkedIn && (
                        <span className="ml-x1 hidden t3-regular text-fg-neutral-subtle md:inline">{stateText(r)}</span>
                      )}
                      {st === "NOT_SUBMITTED" && (
                        <input
                          key={`${r.studentId}-${r.record?.note ?? ""}`}
                          defaultValue={r.record?.note ?? ""}
                          placeholder="미제출 사유"
                          aria-label={`${r.name} 미제출 사유`}
                          type="text"
                          enterKeyHint="done"
                          autoComplete="off"
                          maxLength={200}
                          onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest" })}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (r.record?.note ?? "")) onSet(r, "NOT_SUBMITTED", v);
                          }}
                          className={cn(inputBaseClass, "col-span-2 h-10 w-full t5-regular md:w-44 md:t4-regular")}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  {rows.length === 0 ? (
                    <EmptyState compact icon={Smartphone} title="재원 중인 학생이 없어요" />
                  ) : onlyUnchecked && !query.trim() ? (
                    <EmptyState
                      compact
                      icon={Check}
                      title="확인 전인 학생이 없어요"
                      description="자리에 있는 학생을 모두 확인했어요."
                      action={
                        <Button variant="outline" size="sm" onClick={() => setOnlyUnchecked(false)}>
                          전체 보기
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState
                      compact
                      icon={SearchX}
                      title="검색 결과가 없어요"
                      description="이름이나 좌석 번호로 다시 찾아보세요."
                    />
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}
