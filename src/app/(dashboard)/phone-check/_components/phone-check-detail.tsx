"use client";

// 칸 상세 — 검사 중이 아닐 때 칸을 누르면 연다. 상태·사유를 고치거나 기록을 지운다.

import { useState } from "react";
import type { PhoneCheckStatus } from "@/generated/prisma";
import type { PhoneCheckRow } from "@/lib/phone-check-core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { inputBaseClass } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STATUS_META, STATUSES, periodLabel, stateText } from "./meta";

export function PhoneCheckDetail({
  row,
  period,
  open,
  onOpenChange,
  onSave,
  onClear,
}: {
  row: PhoneCheckRow;
  period: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (status: PhoneCheckStatus, note: string | null) => void;
  onClear: () => void;
}) {
  // 부모가 학생마다 key 를 바꿔 다시 만든다 — 열 때의 기록이 초깃값
  const [status, setStatus] = useState<PhoneCheckStatus>(
    row.record?.status ?? (row.checkedIn ? "SUBMITTED" : "ABSENT"),
  );
  const [note, setNote] = useState(row.record?.note ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-x5">
        <DialogHeader>
          <DialogTitle className="t7-bold">{row.name}</DialogTitle>
          <DialogDescription className="t4-regular tabular-nums">
            {row.seat ? `${row.seat}번 · ` : ""}
            {stateText(row)}
          </DialogDescription>
        </DialogHeader>

        <div>
          <p className="mb-x2 t4-medium text-fg-neutral">
            {periodLabel(period)} 검사
            {!row.record && <span className="ml-x1_5 t3-regular text-fg-neutral-subtle">아직 기록 없음</span>}
          </p>
          <div className="grid grid-cols-2 gap-x2" role="radiogroup" aria-label="검사 상태">
            {STATUSES.map((s) => {
              const meta = STATUS_META[s];
              const Icon = meta.icon;
              const selected = status === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "inline-flex h-x12 items-center justify-center gap-x1_5 rounded-r3 t5-medium transition-colors",
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
          </div>

          {status === "NOT_SUBMITTED" && (
            <label className="mt-x4 flex flex-col gap-x2">
              <span className="t4-medium text-fg-neutral">
                미제출 사유 <span className="t3-regular text-fg-neutral-subtle">(선택)</span>
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="예: 공기계 제출, 집에 두고 옴"
                type="text"
                enterKeyHint="done"
                autoComplete="off"
                maxLength={200}
                onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest" })}
                className={cn(inputBaseClass, "h-x12 t5-regular")}
              />
            </label>
          )}
        </div>

        <div className="flex flex-col gap-x2">
          <div className="grid grid-cols-2 gap-x2">
            <Button type="button" variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={() => onSave(status, status === "NOT_SUBMITTED" ? note.trim() || null : null)}
            >
              저장
            </Button>
          </div>
          {row.record && (
            <Button type="button" variant="ghost" size="sm" className="self-center text-fg-neutral-subtle" onClick={onClear}>
              기록 지우기
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
