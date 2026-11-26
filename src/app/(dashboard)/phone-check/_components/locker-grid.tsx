"use client";

// 휴대폰 보관함 그리드 — 앞에서 본 모습 그대로 칸을 그린다. 칸 판정·배치는 @/lib/phone-locker.
// 보관함 틀(bg-neutral-weak) 위에 폰이 있어야 할 칸은 흰 타일, 비어 있어야 할 칸은 흐린 자리로 그려
// 실제 보관함과 눈으로 바로 대조되게 한다.

import { memo, type CSSProperties } from "react";
import { Check } from "lucide-react";
import type { SlotKind } from "@/lib/phone-locker";
import { cn } from "@/lib/utils";

export type LockerCellData = {
  studentId: string;
  seat: string;
  name: string;
  kind: SlotKind;
  /** 칸 아래 짧은 표시 — 없음 · 있음 · 면제 · 외출 · 퇴실 */
  sub: string | null;
  /** 지난 교시 미제출이 아직 풀리지 않음 */
  priorMissing: boolean;
  /** 스크린 리더용 설명 */
  label: string;
};

export type LockerSlot = LockerCellData | { empty: true; seat: string | null; key: string };

const KIND_CLASS: Record<SlotKind, string> = {
  todo: "bg-bg-layer-default text-fg-neutral shadow-s1",
  ok: "bg-bg-layer-default text-fg-neutral shadow-s1",
  exempt: "bg-bg-informative-weak text-fg-informative",
  missing:
    "bg-bg-critical-weak text-fg-critical outline-dashed outline-[1.5px] -outline-offset-[1.5px] outline-stroke-critical-solid",
  extra:
    "bg-bg-critical-weak text-fg-critical outline-dashed outline-[1.5px] -outline-offset-[1.5px] outline-stroke-critical-solid",
  away: "text-fg-neutral-subtle shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-subtle)]",
};

const LockerCell = memo(function LockerCell({
  cell,
  onSelect,
}: {
  cell: LockerCellData;
  onSelect: (studentId: string) => void;
}) {
  const away = cell.kind === "away";
  const mismatch = cell.kind === "missing" || cell.kind === "extra";
  return (
    <button
      type="button"
      onClick={() => onSelect(cell.studentId)}
      aria-label={cell.label}
      aria-pressed={mismatch}
      className={cn(
        "relative flex h-x13 min-w-0 flex-col items-center justify-center overflow-hidden rounded-r2 pt-x1_5 text-center",
        "transition-[background-color,color,box-shadow,outline-color,transform] duration-d3 ease-out active:scale-[0.96]",
        "hover:ring-1 hover:ring-inset hover:ring-stroke-neutral-weak",
        "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring",
        KIND_CLASS[cell.kind],
        // 지난 교시 미제출 — 왼쪽 세로 막대
        cell.priorMissing &&
          "before:absolute before:inset-y-1.5 before:left-1 before:w-[3px] before:rounded-full before:bg-bg-critical-solid",
      )}
    >
      <span
        aria-hidden
        className={cn("absolute top-1 t1-medium leading-none tabular-nums opacity-60", cell.priorMissing ? "left-3" : "left-1.5")}
      >
        {cell.seat}
      </span>
      {cell.kind === "ok" && (
        <Check aria-hidden strokeWidth={3} className="absolute right-1 top-1 size-3 text-fg-positive" />
      )}
      <span className={cn("max-w-full truncate px-x1", away ? "t4-medium" : "t4-bold")}>{cell.name}</span>
      {cell.sub && <span className="mt-x0_5 t1-bold leading-none">{cell.sub}</span>}
    </button>
  );
});

function EmptySlot({ seat }: { seat: string | null }) {
  return (
    <div
      aria-hidden
      className="relative h-x13 rounded-r2 border border-dashed border-stroke-neutral-weak"
    >
      {seat && (
        <span className="absolute left-1.5 top-1 t1-medium leading-none tabular-nums text-fg-disabled">{seat}</span>
      )}
    </div>
  );
}

const SHELF_GROUP = 5;

export function LockerGrid({
  shelves,
  leftovers,
  sweeping,
  busy,
  onSelect,
}: {
  shelves: LockerSlot[][];
  /** 보관함 배치에 없는 학생 (좌석 없음·배치에 없는 좌석) */
  leftovers: LockerCellData[];
  sweeping: boolean;
  busy: boolean;
  onSelect: (studentId: string) => void;
}) {
  const cols = Math.max(1, ...shelves.map((s) => s.length));
  const colsVar = { "--cols": cols } as CSSProperties;

  return (
    <section aria-label="휴대폰 보관함">
      <div className="mb-x2 flex flex-wrap items-baseline justify-between gap-x-x3 gap-y-x1">
        <p className="t3-medium text-fg-neutral-subtle">앞에서 본 모습 그대로 · 1줄 = 선반 1개</p>
        {sweeping && <p className="t3-bold text-fg-brand">다른 칸만 눌러요</p>}
      </div>

      <div
        aria-busy={busy}
        style={colsVar}
        className={cn(
          "rounded-r4 bg-bg-neutral-weak p-x2 transition-[box-shadow,opacity] duration-d4 md:p-x4",
          sweeping && "shadow-[inset_0_0_0_2px_var(--seed-color-stroke-brand-solid)]",
          busy && "pointer-events-none opacity-60",
        )}
      >
        {shelves.map((shelf, i) => {
          const no = i + 1;
          const strong = no % SHELF_GROUP === 0;
          return (
            <div
              key={i}
              role="group"
              aria-label={`${no}번째 선반`}
              className={cn(
                "grid grid-cols-[1.25rem_repeat(var(--cols),minmax(0,1fr))] items-center gap-x1 md:grid-cols-[1.75rem_repeat(var(--cols),minmax(0,1fr))] md:gap-x1_5",
                i > 0 && (i % SHELF_GROUP === 0 ? "mt-x3" : "mt-x1 md:mt-x1_5"),
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "text-center tabular-nums",
                  strong ? "t3-bold text-fg-neutral" : "t3-medium text-fg-placeholder",
                )}
              >
                {no}
              </span>
              {shelf.map((slot) =>
                "empty" in slot ? (
                  <EmptySlot key={slot.key} seat={slot.seat} />
                ) : (
                  <LockerCell key={slot.studentId} cell={slot} onSelect={onSelect} />
                ),
              )}
            </div>
          );
        })}
      </div>

      <Legend />

      {leftovers.length > 0 && (
        <div className="mt-x6">
          <h3 className="t5-bold text-fg-neutral">
            보관함에 없는 학생 <span className="tabular-nums text-fg-brand">{leftovers.length}</span>
          </h3>
          <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">좌석이 없거나 보관함 배치에 없는 좌석이에요.</p>
          <div
            style={colsVar}
            className="mt-x3 grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-x1 rounded-r4 bg-bg-neutral-weak p-x2 md:gap-x1_5 md:p-x4"
          >
            {leftovers.map((c) => (
              <LockerCell key={c.studentId} cell={c} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Legend() {
  const swatch = "inline-block h-x3_5 w-x5 shrink-0 rounded-r1";
  return (
    <ul className="mt-x3 flex flex-wrap gap-x-x4 gap-y-x2 t3-regular text-fg-neutral-subtle">
      <li className="flex items-center gap-x1_5">
        <span aria-hidden className={cn(swatch, "bg-bg-layer-default shadow-s1 ring-1 ring-inset ring-stroke-neutral-weak")} />
        있어야 함
      </li>
      <li className="flex items-center gap-x1_5">
        <span aria-hidden className={cn(swatch, "bg-bg-neutral-weak shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-subtle)]")} />
        비어 있어야 함
      </li>
      <li className="flex items-center gap-x1_5">
        <span
          aria-hidden
          className={cn(swatch, "bg-bg-critical-weak outline-dashed outline-[1.5px] -outline-offset-[1.5px] outline-stroke-critical-solid")}
        />
        다른 칸
      </li>
      <li className="flex items-center gap-x1_5">
        <span aria-hidden className={cn(swatch, "bg-bg-informative-weak")} />
        면제
      </li>
      <li className="flex items-center gap-x1_5">
        <span aria-hidden className="inline-block h-x3_5 w-[3px] shrink-0 rounded-full bg-bg-critical-solid" />
        지난 교시 미제출
      </li>
    </ul>
  );
}
