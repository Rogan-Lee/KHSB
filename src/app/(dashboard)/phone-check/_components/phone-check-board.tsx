"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, UserX, ShieldCheck, Loader2, SearchX, Smartphone } from "lucide-react";
import {
  setPhoneCheck,
  bulkMarkSubmitted,
  type PhoneCheckRow,
} from "@/actions/phone-check";
import type { PhoneCheckStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { inputBaseClass } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  EmptyState,
  FilterChip,
  SearchField,
  StatCard,
  StatCards,
  StatusBadge,
  TableCard,
  Toolbar,
} from "@/components/backoffice/ui";

// 검사 상태 → SEED 역할색: 제출 positive · 미제출 critical · 미입실 neutral · 면제 informative
const STATUS_META: Record<
  PhoneCheckStatus,
  { label: string; icon: typeof Check; selected: string }
> = {
  SUBMITTED: {
    label: "제출",
    icon: Check,
    selected: "bg-bg-positive-weak text-fg-positive shadow-[inset_0_0_0_1.5px_var(--seed-color-stroke-positive-solid)]",
  },
  NOT_SUBMITTED: {
    label: "미제출",
    icon: X,
    selected: "bg-bg-critical-weak text-fg-critical shadow-[inset_0_0_0_1.5px_var(--seed-color-stroke-critical-solid)]",
  },
  ABSENT: {
    label: "미입실",
    icon: UserX,
    selected: "bg-bg-neutral-weak text-fg-neutral shadow-[inset_0_0_0_1.5px_var(--seed-color-stroke-neutral-solid)]",
  },
  EXEMPT: {
    label: "면제",
    icon: ShieldCheck,
    selected:
      "bg-bg-informative-weak text-fg-informative shadow-[inset_0_0_0_1.5px_var(--seed-color-stroke-informative-solid)]",
  },
};
const STATUSES = Object.keys(STATUS_META) as PhoneCheckStatus[];

export function PhoneCheckBoard({ date, initialRows }: { date: string; initialRows: PhoneCheckRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // 서버 리패치(날짜 변경) 후 로컬 optimistic 상태 동기화
  const [syncedKey, setSyncedKey] = useState(date);
  if (syncedKey !== date) {
    setSyncedKey(date);
    setRows(initialRows);
  }

  // 기록 없는 미입실 학생은 기본 "미입실"로 표시
  const effectiveStatus = (r: PhoneCheckRow): PhoneCheckStatus | null =>
    r.record?.status ?? (r.checkedIn ? null : "ABSENT");

  const counts = useMemo(() => {
    const c: Record<PhoneCheckStatus, number> = { SUBMITTED: 0, NOT_SUBMITTED: 0, ABSENT: 0, EXEMPT: 0 };
    for (const r of rows) {
      const st = effectiveStatus(r);
      if (st) c[st] += 1;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!onlyUnchecked || (r.checkedIn && !r.record)) &&
        (!q || `${r.name} ${r.seat ?? ""}`.toLowerCase().includes(q)),
    );
  }, [query, rows, onlyUnchecked]);

  const uncheckedInIds = useMemo(
    () => rows.filter((r) => r.checkedIn && !r.record).map((r) => r.studentId),
    [rows],
  );

  function applyLocal(studentId: string, record: PhoneCheckRow["record"]) {
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, record } : r)));
  }

  function handleSet(row: PhoneCheckRow, status: PhoneCheckStatus, note?: string) {
    const prevRecord = row.record;
    const nextNote = status === "NOT_SUBMITTED" ? (note ?? prevRecord?.note ?? null) : null;
    applyLocal(row.studentId, { status, note: nextNote });
    startTransition(async () => {
      try {
        await setPhoneCheck(row.studentId, date, status, nextNote ?? undefined);
      } catch (e) {
        applyLocal(row.studentId, prevRecord);
        toast.error(e instanceof Error ? e.message : "저장에 실패했습니다");
      }
    });
  }

  // 일괄 처리 — 대상이 없으면 안내, 있으면 확인 다이얼로그를 연다
  function handleBulk() {
    if (uncheckedInIds.length === 0) {
      toast.info("일괄 처리할 미검사 입실자가 없습니다");
      return;
    }
    setBulkOpen(true);
  }

  function runBulk() {
    setBulkOpen(false);
    const ids = new Set(uncheckedInIds);
    setRows((prev) =>
      prev.map((r) => (ids.has(r.studentId) ? { ...r, record: { status: "SUBMITTED", note: null } } : r)),
    );
    startTransition(async () => {
      try {
        const n = await bulkMarkSubmitted(date, [...ids]);
        toast.success(`${n}명 제출 처리 완료`);
      } catch (e) {
        setRows((prev) =>
          prev.map((r) => (ids.has(r.studentId) ? { ...r, record: null } : r)),
        );
        toast.error(e instanceof Error ? e.message : "일괄 처리에 실패했습니다");
      }
    });
  }

  const uncheckedCount = uncheckedInIds.length;

  return (
    <div className="flex flex-col gap-x6">
      {/* 요약 — 가장 먼저 봐야 할 것: 아직 확인하지 않은 입실자 수 */}
      <StatCards cols={5}>
        <StatCard
          label="미검사"
          value={uncheckedCount}
          unit="명"
          tone={uncheckedCount > 0 ? "warn" : "gray"}
          sub="입실했지만 기록 없음"
        />
        <StatCard label="제출" value={counts.SUBMITTED} unit="명" tone={counts.SUBMITTED > 0 ? "ok" : "gray"} />
        <StatCard label="미제출" value={counts.NOT_SUBMITTED} unit="명" tone={counts.NOT_SUBMITTED > 0 ? "bad" : "gray"} />
        <StatCard label="면제" value={counts.EXEMPT} unit="명" />
        <StatCard label="미입실" value={counts.ABSENT} unit="명" className="col-span-2 lg:col-span-1" />
      </StatCards>

      <div>
        {/* 도구 줄 — 스크롤해도 앱 헤더 아래에 붙어 있다 */}
        <Toolbar className="sticky top-14 z-10 mb-x3 bg-bg-layer-default py-x3">
          <input
            type="date"
            value={date}
            aria-label="검사 날짜"
            onChange={(e) => e.target.value && router.replace(`/phone-check?date=${e.target.value}`)}
            className={cn(inputBaseClass, "h-10 w-auto tabular-nums")}
          />
          <SearchField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 · 좌석 검색"
            aria-label="학생 검색"
          />
          <FilterChip
            selected={onlyUnchecked}
            count={uncheckedCount}
            onClick={() => setOnlyUnchecked((v) => !v)}
            className="h-9 px-x3_5 t4-medium"
          >
            미검사만
          </FilterChip>
          <Button type="button" onClick={handleBulk} disabled={pending} className="w-full sm:ml-auto sm:w-auto">
            {pending ? <Loader2 className="animate-spin" /> : <Check />}
            입실자 일괄 제출 처리
            <span className="tabular-nums">({uncheckedCount})</span>
          </Button>
        </Toolbar>

        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 text-center">좌석</TableHead>
                <TableHead>이름</TableHead>
                <TableHead className="w-20">학년</TableHead>
                <TableHead className="w-20">입실</TableHead>
                <TableHead>검사 상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const st = effectiveStatus(r);
                const unchecked = r.checkedIn && !r.record;
                return (
                  <TableRow key={r.studentId}>
                    <TableCell className="text-center t5-bold tabular-nums">{r.seat ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-x2">
                        <span className="t5-bold text-fg-neutral">{r.name}</span>
                        {unchecked && <StatusBadge tone="warn">미검사</StatusBadge>}
                      </div>
                    </TableCell>
                    <TableCell className="t3-regular text-fg-neutral-muted">{r.grade}</TableCell>
                    <TableCell className="tabular-nums">
                      {r.checkInAt ?? <span className="t3-regular text-fg-neutral-subtle">미입실</span>}
                    </TableCell>
                    <TableCell className="py-x2">
                      <div className="flex flex-wrap items-center gap-x1_5" role="group" aria-label={`${r.name} 검사 상태`}>
                        {STATUSES.map((s) => {
                          const meta = STATUS_META[s];
                          const Icon = meta.icon;
                          const selected = st === s;
                          return (
                            <button
                              key={s}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => handleSet(r, s)}
                              className={cn(
                                "inline-flex h-10 items-center gap-x1 rounded-r2 px-x3 t4-medium transition-colors",
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
                        {st === "NOT_SUBMITTED" && (
                          <input
                            key={`${r.studentId}-${r.record?.note ?? ""}`}
                            defaultValue={r.record?.note ?? ""}
                            placeholder="미제출 사유"
                            aria-label={`${r.name} 미제출 사유`}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (r.record?.note ?? "")) handleSet(r, "NOT_SUBMITTED", v);
                            }}
                            className={cn(inputBaseClass, "h-10 w-44")}
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
                        title="미검사 입실자가 없어요"
                        description="입실한 학생을 모두 확인했어요."
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

      {/* 일괄 제출 확인 */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>미검사 입실자 {uncheckedCount}명을 제출로 기록할까요?</DialogTitle>
            <DialogDescription>아직 검사 기록이 없는 입실자만 &apos;제출&apos;로 바뀌어요. 이미 기록한 학생은 그대로예요.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              취소
            </Button>
            <Button onClick={runBulk}>일괄 제출 처리</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
