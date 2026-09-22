"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, UserX, ShieldCheck, Search, Smartphone, Loader2 } from "lucide-react";
import {
  setPhoneCheck,
  bulkMarkSubmitted,
  type PhoneCheckRow,
} from "@/actions/phone-check";
import type { PhoneCheckStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  PhoneCheckStatus,
  { label: string; icon: typeof Check; selected: string }
> = {
  SUBMITTED: { label: "제출", icon: Check, selected: "border-ok bg-ok-soft text-ok-ink" },
  NOT_SUBMITTED: { label: "미제출", icon: X, selected: "border-bad bg-bad-soft text-bad-ink" },
  ABSENT: { label: "미입실", icon: UserX, selected: "border-line bg-panel-2 text-ink-3" },
  EXEMPT: { label: "면제", icon: ShieldCheck, selected: "border-brand bg-brand-soft text-brand-2" },
};
const STATUSES = Object.keys(STATUS_META) as PhoneCheckStatus[];

export function PhoneCheckBoard({ date, initialRows }: { date: string; initialRows: PhoneCheckRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
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
    if (!q) return rows;
    return rows.filter((r) => `${r.name} ${r.seat ?? ""}`.toLowerCase().includes(q));
  }, [query, rows]);

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

  function handleBulk() {
    if (uncheckedInIds.length === 0) {
      toast.info("일괄 처리할 미검사 입실자가 없습니다");
      return;
    }
    if (!confirm(`미검사 입실자 ${uncheckedInIds.length}명을 모두 '제출'로 기록할까요?`)) return;
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

  return (
    <div className="space-y-3">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STATUSES.map((st) => {
          const meta = STATUS_META[st];
          const Icon = meta.icon;
          return (
            <div key={st} className="rounded-xl border border-line bg-panel px-4 py-3 shadow-[var(--shadow-xs)]">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink-4">
                <Icon className="h-3.5 w-3.5" /> {meta.label}
              </p>
              <p className="mt-1 text-[20px] font-bold tabular-nums text-ink">{counts[st]}</p>
            </div>
          );
        })}
      </div>

      {/* 테이블 */}
      <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-[var(--shadow-xs)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-2 px-3 py-2.5">
          <Smartphone className="h-4 w-4 shrink-0 text-brand" />
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && router.replace(`/phone-check?date=${e.target.value}`)}
            className="h-8 rounded-md border border-line bg-canvas px-2 text-[13px] focus:border-brand focus:outline-none"
          />
          <div className="relative min-w-[160px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 · 좌석 검색"
              className="h-8 w-full rounded-md border border-line bg-canvas pl-8 pr-2 text-[13px] focus:border-brand focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleBulk}
            disabled={pending}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            입실자 일괄 제출 처리 ({uncheckedInIds.length})
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line-2 bg-panel-2 text-[11px] font-semibold text-ink-4">
                <th className="w-16 px-3 py-2 text-left">좌석</th>
                <th className="px-3 py-2 text-left">이름</th>
                <th className="w-16 px-3 py-2 text-left">학년</th>
                <th className="w-20 px-3 py-2 text-left">입실</th>
                <th className="px-3 py-2 text-left">검사 상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const st = effectiveStatus(r);
                return (
                  <tr key={r.studentId} className="border-b border-line-2 last:border-0">
                    <td className="px-3 py-2 font-mono text-[12px] text-ink-4">{r.seat ?? "—"}</td>
                    <td className="px-3 py-2 font-medium text-ink">{r.name}</td>
                    <td className="px-3 py-2 text-[11.5px] text-ink-4">{r.grade}</td>
                    <td className="px-3 py-2 font-mono text-[12px] tabular-nums text-ink-3">
                      {r.checkInAt ?? <span className="text-ink-4">미입실</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {STATUSES.map((s) => {
                          const meta = STATUS_META[s];
                          const selected = st === s;
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => handleSet(r, s)}
                              className={cn(
                                "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[12px] font-medium transition",
                                selected ? meta.selected : "border-line text-ink-4 hover:bg-panel-2",
                              )}
                            >
                              {meta.label}
                            </button>
                          );
                        })}
                        {st === "NOT_SUBMITTED" && (
                          <input
                            key={`${r.studentId}-${r.record?.note ?? ""}`}
                            defaultValue={r.record?.note ?? ""}
                            placeholder="미제출 사유"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (r.record?.note ?? "")) handleSet(r, "NOT_SUBMITTED", v);
                            }}
                            className="h-7 w-40 rounded-md border border-line bg-canvas px-2 text-[12px] focus:border-brand focus:outline-none"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[13px] text-ink-4">
                    {rows.length === 0 ? "재원(ACTIVE) 학생이 없습니다" : "검색 결과 없음"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
