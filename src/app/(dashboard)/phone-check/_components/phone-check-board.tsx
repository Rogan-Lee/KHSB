"use client";

// 휴대폰 검사 — 보관함 앞에서 화면과 실제를 대조한다. 화면이 '지금 있어야 할 모습'을 그리고,
// 검사하는 사람은 실제와 다른 칸만 누른다. 완료하면 나머지(자리에 있는데 기록 없는 학생)는 한 번에 제출로.
// 교시마다(입실 + 1~N교시) 되풀이한다. 판정 규칙은 @/lib/phone-locker.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Clock, Loader2, ScanLine } from "lucide-react";
import type { PhoneCheckStatus } from "@/generated/prisma";
import { clearPhoneCheck, completePhoneCheck, setPhoneCheck } from "@/actions/phone-check";
import type { PhoneCheckBoardData, PhoneCheckRow } from "@/lib/phone-check-core";
import { currentPeriodNo, type ClassPeriod } from "@/lib/class-periods";
import { completionTargets, isMismatch, PHONE_LOCKER_ROWS, slotKind, type SlotKind } from "@/lib/phone-locker";
import { useStickyState } from "@/hooks/use-sticky-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { inputBaseClass } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/backoffice/confirm-dialog";
import { FilterChip, Segmented, StatusBadge, type Tone } from "@/components/backoffice/ui";
import { LockerGrid, type LockerCellData, type LockerSlot } from "./locker-grid";
import { PhoneCheckDetail } from "./phone-check-detail";
import { PhoneCheckList } from "./phone-check-list";
import { awayLabel, clockLabel, mismatchText, periodLabel, stateText } from "./meta";

type Rec = PhoneCheckRow["record"];
/** 누른 즉시 보이게 덮어쓰는 기록 — 서버 응답이 오고(settled) 새 보드가 도착하면 걷어낸다 */
type Overlay = Record<string, { record: Rec; settled: boolean }>;
type View = "locker" | "list";

const SUB: Partial<Record<SlotKind, string>> = { missing: "없음", extra: "있음", exempt: "면제" };

/** 분 → "8분 뒤" · "1시간 5분 뒤" (앱과 같은 표기) */
function untilText(min: number) {
  if (min <= 0) return "곧 시작";
  if (min < 60) return `${min}분 뒤`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h}시간 ${min % 60}분 뒤` : `${h}시간 뒤`;
}

const kstIso = (d: Date) => new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString();
const kstHHMM = (d: Date) => kstIso(d).slice(11, 16);
const kstDate = (iso: string) => kstIso(new Date(iso)).slice(0, 10);

export function PhoneCheckBoard({
  board,
  periods,
  currentPeriod,
  serverNow,
}: {
  board: PhoneCheckBoardData;
  periods: ClassPeriod[];
  /** 오늘이면 지금 교시(0=첫 교시 전), 다른 날이면 null */
  currentPeriod: number | null;
  serverNow: string;
}) {
  const router = useRouter();
  const { date, period, live } = board;
  const viewKey = `${date}:${period}`;
  const P = periodLabel(period);

  const [view, setView] = useStickyState<View>("phone-check:view", "locker");
  const [sweepKey, setSweepKey] = useStickyState<string | null>("phone-check:sweep", null);
  const sweeping = live && sweepKey === viewKey;

  // ── 낙관적 반영 ───────────────────────────────────────────
  const [overlay, setOverlay] = useState<Overlay>({});
  const [seen, setSeen] = useState({ board, viewKey });
  if (seen.board !== board) {
    setSeen({ board, viewKey });
    // 다른 날짜·교시로 옮기면 전부, 같은 화면의 새 데이터면 응답이 끝난 것만 걷어낸다
    setOverlay((o) =>
      seen.viewKey !== viewKey ? {} : Object.fromEntries(Object.entries(o).filter(([, v]) => !v.settled)),
    );
  }
  const rows = useMemo(
    () => board.rows.map((r) => (overlay[r.studentId] ? { ...r, record: overlay[r.studentId].record } : r)),
    [board.rows, overlay],
  );
  const rowById = useMemo(() => new Map(rows.map((r) => [r.studentId, r])), [rows]);

  function put(id: string, record: Rec, settled: boolean) {
    setOverlay((o) => ({ ...o, [id]: { record, settled } }));
  }
  function drop(...ids: string[]) {
    setOverlay((o) => Object.fromEntries(Object.entries(o).filter(([k]) => !ids.includes(k))));
  }

  async function save(row: PhoneCheckRow, status: PhoneCheckStatus, note: string | null = null) {
    const record = { status, note: status === "NOT_SUBMITTED" ? note : null };
    put(row.studentId, record, false);
    try {
      await setPhoneCheck(row.studentId, date, status, record.note ?? undefined, period);
      put(row.studentId, record, true);
    } catch (e) {
      drop(row.studentId);
      toast.error(e instanceof Error ? e.message : "저장하지 못했어요");
    }
  }

  async function clear(row: PhoneCheckRow) {
    put(row.studentId, null, false);
    try {
      await clearPhoneCheck(row.studentId, date, period);
      put(row.studentId, null, true);
    } catch (e) {
      drop(row.studentId);
      toast.error(e instanceof Error ? e.message : "되돌리지 못했어요");
    }
  }

  // ── 검사 모드: 다른 칸 토글 ───────────────────────────────
  // 검사 모드에서 처음 누르기 전 기록 — 다시 누르면 이걸로 되돌린다
  const before = useRef(new Map<string, Rec>());

  function toggle(row: PhoneCheckRow) {
    const kind = slotKind(row);
    if (isMismatch(kind)) {
      if (before.current.has(row.studentId)) {
        const prev = before.current.get(row.studentId) ?? null;
        before.current.delete(row.studentId);
        void (prev ? save(row, prev.status, prev.note) : clear(row));
      } else {
        // 검사 전부터 다른 칸이던 것 — 지금은 실제와 같다는 뜻
        void (kind === "missing" ? save(row, "SUBMITTED") : clear(row));
      }
      return;
    }
    before.current.set(row.studentId, row.record);
    void save(row, kind === "away" ? "SUBMITTED" : "NOT_SUBMITTED");
  }

  // ── 칸 누르기: 검사 중이면 토글, 아니면 상세 ───────────────
  const [detail, setDetail] = useState<{ id: string; open: boolean } | null>(null);
  const select = (id: string) => {
    const row = rowById.get(id);
    if (!row) return;
    if (sweeping) toggle(row);
    else setDetail({ id, open: true });
  };
  // 칸(memo)에 넘기는 콜백은 고정 — 최신 select 를 ref 로 부른다
  const selectRef = useRef(select);
  useLayoutEffect(() => {
    selectRef.current = select;
  });
  const onSelect = useCallback((id: string) => selectRef.current(id), []);
  const detailRow = detail ? rowById.get(detail.id) : undefined;

  // ── 집계 ─────────────────────────────────────────────────
  const kinds = useMemo(() => new Map(rows.map((r) => [r.studentId, slotKind(r)])), [rows]);
  const targets = useMemo(() => completionTargets(rows), [rows]);
  const pendingCount = targets.submitted.length + targets.exempt.length;
  const stats = useMemo(() => {
    let matched = 0;
    let here = 0;
    const mismatches: PhoneCheckRow[] = [];
    for (const r of rows) {
      const k = kinds.get(r.studentId)!;
      if (r.checkedIn) here += 1;
      if (isMismatch(k)) mismatches.push(r);
      else if (r.record && (k === "ok" || k === "exempt")) matched += 1;
    }
    return { matched, here, mismatches };
  }, [rows, kinds]);
  const anyRecord = rows.some((r) => r.record);
  const phase: "sweep" | "done" | "partial" | "idle" = sweeping
    ? "sweep"
    : anyRecord && pendingCount === 0
      ? "done"
      : (stats.matched > 0 || stats.mismatches.length > 0) && pendingCount > 0
        ? "partial"
        : "idle";

  // ── 보관함 칸 배치 ────────────────────────────────────────
  const { shelves, leftovers } = useMemo(() => {
    const cell = (r: PhoneCheckRow): LockerCellData => {
      const kind = kinds.get(r.studentId)!;
      const sub = kind === "away" ? awayLabel(r) : (SUB[kind] ?? null);
      const priorMissing = r.prior === "NOT_SUBMITTED" && (kind === "todo" || kind === "missing");
      const what = isMismatch(kind)
        ? `다른 칸, ${mismatchText(r, kind)}`
        : kind === "away"
          ? `비어 있어야 함, ${stateText(r)}`
          : kind === "exempt"
            ? "면제"
            : kind === "ok"
              ? "있어야 함, 제출 확인"
              : "있어야 함";
      return {
        studentId: r.studentId,
        seat: r.seat?.trim() ?? "",
        name: r.name,
        kind,
        sub,
        priorMissing,
        label: `${r.seat ? `${r.seat}번 ` : ""}${r.name}, ${what}${priorMissing ? ", 지난 교시 미제출" : ""}`,
      };
    };
    const bySeat = new Map<string, PhoneCheckRow>();
    const placed = new Set<string>();
    for (const r of rows) {
      const s = r.seat?.trim();
      if (s && !bySeat.has(s)) bySeat.set(s, r);
    }
    const shelves: LockerSlot[][] = PHONE_LOCKER_ROWS.map((shelf, si) =>
      shelf.map((n, i): LockerSlot => {
        const r = n === null ? undefined : bySeat.get(String(n));
        if (!r) return { empty: true, seat: n === null ? null : String(n), key: `${si}-${i}` };
        placed.add(r.studentId);
        return cell(r);
      }),
    );
    // 배치 밖 학생은 오늘 상관있는 학생만 (자리에 있거나 이 교시 기록이 있음) — 온라인 관리생 등은 빼고
    const leftovers = rows.filter((r) => !placed.has(r.studentId) && (r.checkedIn || r.record)).map(cell);
    return { shelves, leftovers };
  }, [rows, kinds]);

  // ── 새로고침 · 시계 · 교시 자동 넘김 ───────────────────────
  const [refreshing, startRefresh] = useTransition();
  // 시계는 서버 시각 기준 — 기기 시계가 틀려도 교시·남은 시간이 어긋나지 않게
  const [skew] = useState(() => Date.parse(serverNow) - Date.now());
  const [now, setNow] = useState(() => new Date(serverNow));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date(Date.now() + skew)), 30_000);
    return () => clearInterval(id);
  }, [skew]);
  const nowPeriod = currentPeriod === null ? null : currentPeriodNo(date, kstHHMM(now));
  useEffect(() => {
    // 지금 교시를 보다가 시간이 지나 교시가 바뀌면 따라간다 (검사 중엔 그대로)
    if (sweeping || currentPeriod === null || nowPeriod === null) return;
    if (period === currentPeriod && nowPeriod > currentPeriod) {
      router.replace(`/phone-check?date=${date}&period=${nowPeriod}`);
    }
  }, [sweeping, currentPeriod, nowPeriod, period, date, router]);
  useEffect(() => {
    // 다른 앱·탭을 보다 돌아오면 자리 판정을 새로 받는다
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 20_000) return;
      last = Date.now();
      startRefresh(() => router.refresh());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  const next = currentPeriod === null ? undefined : periods.find((p) => p.no === (nowPeriod ?? 0) + 1);
  const nextIn = next
    ? Math.max(0, Math.round((Date.parse(`${date}T${next.start}:00+09:00`) - now.getTime()) / 60_000))
    : null;

  // 고른 교시 칩을 줄 가운데로 — 교시가 바뀔 때만, 가로로만 (검사 중 칸을 누를 때 페이지가 튀지 않게)
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const chip = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (strip && chip) strip.scrollLeft = chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2;
  }, [period]);

  // ── 검사 시작 · 완료 ──────────────────────────────────────
  function startSweep() {
    before.current.clear();
    setSweepKey(viewKey);
    setView("locker");
    // 시작하는 순간의 입실·외출·퇴실로 다시 그린다
    startRefresh(() => router.refresh());
  }

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completing, setCompleting] = useState(false);

  async function complete() {
    const { submitted, exempt } = targets;
    const mark = (settled: boolean) =>
      setOverlay((o) => ({
        ...o,
        ...Object.fromEntries(submitted.map((id) => [id, { record: { status: "SUBMITTED" as const, note: null }, settled }])),
        ...Object.fromEntries(exempt.map((id) => [id, { record: { status: "EXEMPT" as const, note: null }, settled }])),
      }));
    setCompleting(true);
    mark(false);
    try {
      await completePhoneCheck(date, period, submitted, exempt);
      mark(true);
      setSweepKey(null);
      setConfirmOpen(false);
      toast.success(`${P} 검사를 기록했어요`);
    } catch (e) {
      drop(...submitted, ...exempt);
      toast.error(e instanceof Error ? e.message : "기록하지 못했어요");
    } finally {
      setCompleting(false);
    }
  }

  // ── 하단·패널 버튼 ────────────────────────────────────────
  const mismatchCount = stats.mismatches.length;
  const actions = !live ? null : sweeping ? (
    <div className="flex gap-x2">
      <Button type="button" variant="secondary" size="lg" onClick={() => setSweepKey(null)} disabled={completing}>
        그만
      </Button>
      <Button
        type="button"
        size="lg"
        className="flex-1"
        onClick={() => setConfirmOpen(true)}
        disabled={completing || refreshing}
      >
        <Check />
        검사 완료
        {mismatchCount > 0 && <span className="tabular-nums opacity-80">· 다른 칸 {mismatchCount}</span>}
      </Button>
    </div>
  ) : (
    <Button
      type="button"
      size="lg"
      variant={phase === "done" ? "outline" : "default"}
      className="w-full"
      onClick={startSweep}
      disabled={refreshing}
    >
      {refreshing ? <Loader2 className="animate-spin" /> : <ScanLine />}
      {phase === "done" ? "다시 검사" : phase === "partial" ? `이어서 검사 · ${pendingCount}명 남음` : `${P} 검사 시작`}
    </Button>
  );

  const badge: { tone: Tone; label: string } =
    phase === "sweep"
      ? { tone: "brand", label: "검사 중" }
      : phase === "done"
        ? { tone: "ok", label: "완료" }
        : phase === "partial"
          ? { tone: "warn", label: `${pendingCount}명 남음` }
          : { tone: "gray", label: "검사 전" };

  const slot = periods.find((p) => p.no === period);
  const subline =
    phase === "sweep"
      ? "실제와 다른 칸만 눌러요. 다시 누르면 되돌려요."
      : (phase === "done" || phase === "partial") && board.lastCheck
        ? `${clockLabel(board.lastCheck.at)}${board.lastCheck.by ? ` · ${board.lastCheck.by}` : ""}`
        : `${slot ? `${slot.start}~${slot.end} · ` : ""}자리에 ${stats.here}명`;

  // ── 화면 ─────────────────────────────────────────────────
  const summary = (
    <div
      className={cn(
        "rounded-r4 border bg-bg-layer-default p-x5 transition-colors duration-d4",
        sweeping ? "border-stroke-brand-solid" : "border-stroke-neutral-muted",
      )}
    >
      <div className="flex items-center gap-x2">
        <h2 className="t7-bold text-fg-neutral">{P} 검사</h2>
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      </div>
      <p className={cn("mt-x1 t4-regular tabular-nums", sweeping ? "text-fg-brand" : "text-fg-neutral-subtle")}>
        {subline}
      </p>

      <dl className="mt-x5 grid grid-cols-3 gap-x3">
        {[
          { label: "기록과 일치", value: stats.matched, tone: "text-fg-neutral" },
          { label: "다른 칸", value: mismatchCount, tone: mismatchCount ? "text-fg-critical" : "text-fg-neutral" },
          { label: "확인 전", value: pendingCount, tone: pendingCount && phase !== "idle" ? "text-fg-warning" : "text-fg-neutral" },
        ].map((s) => (
          <div key={s.label} className="min-w-0">
            <dd className={cn("t9-bold tabular-nums md:t10-bold", s.tone)}>{s.value}</dd>
            <dt className="mt-x0_5 truncate t3-medium text-fg-neutral-subtle">{s.label}</dt>
          </div>
        ))}
      </dl>

      {live && phase === "done" && next && nextIn !== null && (
        <p className="mt-x4 flex items-center gap-x1_5 t4-regular text-fg-neutral-subtle">
          <Clock className="size-4" aria-hidden />
          다음 검사 {periodLabel(next.no)} {next.start}
          <span className="tabular-nums">· {untilText(nextIn)}</span>
        </p>
      )}
      {!live && (
        <p className="mt-x4 t4-regular text-fg-neutral-subtle">지난 검사예요. 칸을 누르면 기록을 고칠 수 있어요.</p>
      )}

      {actions && <div className="mt-x5 hidden lg:block">{actions}</div>}
    </div>
  );

  const mismatchList = (
    <section aria-label="다른 칸" className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
      <h3 className="flex items-center gap-x1_5 px-x5 pt-x5 t6-bold text-fg-neutral">
        다른 칸
        <span className={cn("tabular-nums", mismatchCount ? "text-fg-critical" : "text-fg-placeholder")}>
          {mismatchCount}
        </span>
      </h3>
      {mismatchCount === 0 ? (
        <p className="px-x5 pb-x5 pt-x2 t4-regular text-fg-neutral-subtle">
          {sweeping ? "실제와 다른 칸을 누르면 여기에 모여요." : "다른 칸이 없어요."}
        </p>
      ) : (
        <ul className="mt-x2 pb-x2">
          {stats.mismatches.map((r) => {
            const kind = kinds.get(r.studentId)!;
            return (
              <li key={r.studentId} className="border-t border-stroke-neutral-subtle px-x5 py-x3 first:border-t-0">
                <div className="flex items-center gap-x3">
                  <span className="grid h-x9 min-w-9 place-items-center rounded-r2 bg-bg-critical-weak px-x1_5 t4-bold tabular-nums text-fg-critical">
                    {r.seat?.trim() || "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate t5-bold text-fg-neutral">{r.name}</p>
                    <p className="truncate t3-regular text-fg-critical">{mismatchText(r, kind)}</p>
                  </div>
                  {kind === "missing" && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => void save(r, "EXEMPT")}>
                      면제
                    </Button>
                  )}
                </div>
                {kind === "missing" && (
                  <input
                    key={`${r.studentId}-${r.record?.note ?? ""}`}
                    defaultValue={r.record?.note ?? ""}
                    placeholder="미제출 사유 (예: 공기계 제출)"
                    aria-label={`${r.name} 미제출 사유`}
                    type="text"
                    enterKeyHint="done"
                    autoComplete="off"
                    maxLength={200}
                    onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest" })}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (r.record?.note ?? "")) void save(r, "NOT_SUBMITTED", v || null);
                    }}
                    className={cn(inputBaseClass, "mt-x2_5 h-x10 t5-regular md:t4-regular")}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-x5">
      {/* 날짜 · 보기 전환 */}
      {/* 좁은 휴대폰(360)에선 두 줄로 나뉘어 각각 꽉 차고, 넓으면 한 줄 */}
      <div className="flex flex-wrap items-center gap-x2">
        <input
          type="date"
          value={date}
          max={kstDate(serverNow)}
          aria-label="검사 날짜"
          onChange={(e) => e.target.value && router.replace(`/phone-check?date=${e.target.value}`)}
          className={cn(inputBaseClass, "h-10 w-auto grow t5-regular tabular-nums sm:grow-0 md:t4-regular")}
        />
        <Segmented<View>
          aria-label="보기 전환"
          className="w-auto grow sm:ml-auto sm:min-w-[11rem] sm:grow-0"
          value={view}
          onChange={setView}
          options={[
            { value: "locker", label: "보관함" },
            { value: "list", label: "목록" },
          ]}
        />
      </div>

      {/* 교시 — 입실 때 1번 + 교시마다 1번 */}
      <div
        role="group"
        aria-label="검사 교시"
        ref={stripRef}
        className="relative -mx-4 -my-1 flex gap-x1_5 overflow-x-auto px-x4 py-x1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {[{ no: 0, start: "" }, ...periods].map((p) => {
          const checked = board.checkedPeriods.includes(p.no);
          const isNow = currentPeriod !== null && p.no === (nowPeriod ?? currentPeriod);
          const future = currentPeriod !== null && p.no > (nowPeriod ?? currentPeriod);
          const missed = currentPeriod !== null && p.no > 0 && p.no < (nowPeriod ?? currentPeriod) && !checked;
          const selected = period === p.no;
          return (
            <FilterChip
              key={p.no}
              selected={selected}
              disabled={future}
              onClick={() => router.replace(`/phone-check?date=${date}&period=${p.no}`)}
              aria-label={`${periodLabel(p.no)}${checked ? ", 검사함" : missed ? ", 검사 안 함" : ""}${isNow ? ", 지금" : ""}`}
              // 보이는 높이는 36px, 누르는 영역은 위아래로 넓혀 44px
              className="relative h-9 gap-x1_5 px-x3_5 after:absolute after:inset-x-0 after:-inset-y-1"
            >
              {checked ? (
                <Check aria-hidden strokeWidth={3} className={cn("size-3.5", !selected && "text-fg-positive")} />
              ) : missed ? (
                <span aria-hidden className="size-1.5 rounded-full bg-bg-warning-solid" />
              ) : null}
              <span className="t4-medium">{periodLabel(p.no)}</span>
              {p.start && <span className="t3-regular tabular-nums opacity-70">{p.start}</span>}
              {isNow && <span className={cn("t2-bold", selected ? "" : "text-fg-brand")}>지금</span>}
            </FilterChip>
          );
        })}
      </div>

      {view === "list" ? (
        <PhoneCheckList
          rows={rows}
          pendingCount={pendingCount}
          busy={completing}
          onSet={(r, s, note) => void save(r, s, note ?? r.record?.note ?? null)}
          onBulk={() => setConfirmOpen(true)}
        />
      ) : (
        // 휴대폰: 요약 → 보관함 → 다른 칸 / 넓은 화면: 왼쪽 보관함, 오른쪽 요약·다른 칸(고정)
        <div className="flex flex-col gap-x5 lg:grid lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start lg:gap-x6">
          <div className="contents lg:sticky lg:top-[4.5rem] lg:col-start-2 lg:row-start-1 lg:flex lg:max-h-[calc(100dvh-5.5rem)] lg:flex-col lg:gap-x4 lg:overflow-y-auto">
            <div className="order-1">{summary}</div>
            <div className="order-3">{mismatchList}</div>
          </div>
          <div className="order-2 min-w-0 lg:col-start-1 lg:row-start-1">
            <LockerGrid
              shelves={shelves}
              leftovers={leftovers}
              sweeping={sweeping}
              busy={refreshing}
              onSelect={onSelect}
            />
          </div>
        </div>
      )}

      {/* 휴대폰 하단 고정 버튼 — 키보드가 열리면 화면 아래에 남아 가려진다(입력 중엔 쓸 일 없음) */}
      {actions && view === "locker" && (
        <div className="sticky bottom-0 z-10 -mx-4 -mb-16 border-t border-stroke-neutral-muted bg-bg-layer-default px-x4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-x3 lg:hidden">
          {actions}
        </div>
      )}

      {detailRow && detail && (
        <PhoneCheckDetail
          key={detailRow.studentId}
          row={detailRow}
          period={period}
          open={detail.open}
          onOpenChange={(open) => setDetail((d) => (d ? { ...d, open } : d))}
          onSave={(status, note) => {
            setDetail((d) => (d ? { ...d, open: false } : d));
            void save(detailRow, status, note);
          }}
          onClear={() => {
            setDetail((d) => (d ? { ...d, open: false } : d));
            void clear(detailRow);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`${P} 검사를 마칠까요?`}
        description={[
          targets.submitted.length > 0 && `확인 전 ${targets.submitted.length}명은 '제출'로 기록돼요.`,
          pendingCount === 0 && "새로 기록할 학생은 없어요.",
          targets.exempt.length > 0 && `앞 교시에 면제였던 ${targets.exempt.length}명은 '면제'로 이어 가요.`,
          mismatchCount > 0 && `다른 칸 ${mismatchCount}곳은 이미 기록됐어요.`,
        ]
          .filter(Boolean)
          .join(" ")}
        cancelLabel="더 볼게요"
        confirmLabel="완료"
        pendingLabel="기록하는 중…"
        pending={completing}
        onConfirm={() => void complete()}
      />
    </div>
  );
}
