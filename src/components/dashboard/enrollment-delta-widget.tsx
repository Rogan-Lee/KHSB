"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Users,
  UserPlus,
  UserMinus,
  TrendingUp,
  TrendingDown,
  Minus,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { setEnrollmentAdjustment, type EnrollmentDelta } from "@/actions/dashboard-widgets";
import { cn } from "@/lib/utils";

export function EnrollmentDeltaWidget({
  data,
  year,
  month,
  canEdit = false,
}: {
  data: EnrollmentDelta;
  year: number;
  month: number;
  canEdit?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  // 빈 문자열 = 자동 집계 사용. override 값이 있으면 그 숫자, 아니면 빈칸(placeholder 로 자동값 표시)
  const [newVal, setNewVal] = useState("");
  const [leftVal, setLeftVal] = useState("");
  const [note, setNote] = useState("");

  function startEdit() {
    setNewVal(data.newOverridden ? String(data.newThisMonth) : "");
    setLeftVal(data.leftOverridden ? String(data.leftThisMonth) : "");
    setNote(data.note ?? "");
    setEditing(true);
  }

  function parseField(v: string): number | null {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  function handleSave() {
    const newCount = parseField(newVal);
    const leftCount = parseField(leftVal);
    if ((newCount != null && newCount < 0) || (leftCount != null && leftCount < 0)) {
      toast.error("0 이상의 숫자를 입력하세요");
      return;
    }
    startTransition(async () => {
      try {
        await setEnrollmentAdjustment(year, month, { newCount, leftCount, note });
        toast.success("원생 증감 저장 완료");
        setEditing(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  return (
    <Card className="rounded-[12px] border-line shadow-[var(--shadow-xs)] overflow-hidden">
      <CardHeader className="flex flex-row items-center gap-2 py-[14px] px-[18px] border-b border-line-2">
        <Users className="h-4 w-4 text-ink-4" />
        <CardTitle className="text-[13.5px] font-[650] tracking-[-0.015em] text-ink m-0">
          원생 증감
        </CardTitle>
        <span className="ml-auto text-[11.5px] text-ink-4 font-mono tabular-nums">
          {year}.{String(month).padStart(2, "0")}
        </span>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={startEdit}
            title="신규·이탈 수동 조정"
            className="p-1 rounded-[6px] text-ink-4 hover:bg-panel-2 hover:text-ink"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {editing && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              title="저장"
              className="p-1 rounded-[6px] text-ok hover:bg-ok-soft disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              title="취소"
              className="p-1 rounded-[6px] text-ink-4 hover:bg-panel-2"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-3 divide-x divide-line-2">
          <Cell
            icon={<Users className="h-3.5 w-3.5" />}
            label="현재 재원"
            value={data.total}
            delta={data.deltaVsLastMonth.total}
            deltaLabel="이번 달 순증"
            tone="ink"
          />
          <Cell
            icon={<UserPlus className="h-3.5 w-3.5" />}
            label="신규 등록"
            value={data.newThisMonth}
            delta={data.deltaVsLastMonth.new}
            deltaLabel="전월비"
            tone="ok"
            overridden={data.newOverridden}
            editing={editing}
            editValue={newVal}
            onEditChange={setNewVal}
            autoPlaceholder={data.newOverridden ? "자동값" : String(data.newThisMonth)}
          />
          <Cell
            icon={<UserMinus className="h-3.5 w-3.5" />}
            label="이탈"
            value={data.leftThisMonth}
            delta={data.deltaVsLastMonth.left}
            deltaLabel="전월비"
            tone="bad"
            deltaInverse
            overridden={data.leftOverridden}
            editing={editing}
            editValue={leftVal}
            onEditChange={setLeftVal}
            autoPlaceholder={data.leftOverridden ? "자동값" : String(data.leftThisMonth)}
          />
        </div>
        {editing ? (
          <div className="px-[18px] py-2.5 border-t border-line-2 bg-panel-2 space-y-1.5">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="조정 사유 (선택)"
              className="h-7 text-[11.5px]"
            />
            <p className="text-[10.5px] text-ink-4">
              칸을 비우면 자동 집계(등록·종료일 기준)를 사용합니다.
            </p>
          </div>
        ) : (
          <p className="px-[18px] py-2 text-[10.5px] text-ink-4 border-t border-line-2 bg-panel-2">
            {data.note
              ? `수동 조정: ${data.note}`
              : "현재 재원은 실제 재원(ACTIVE) 기준. 신규·이탈은 해당 월 등록·종료일 기준."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Cell({
  icon,
  label,
  value,
  delta,
  deltaLabel,
  tone,
  deltaInverse,
  overridden,
  editing,
  editValue,
  onEditChange,
  autoPlaceholder,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  delta: number;
  deltaLabel: string;
  tone: "ink" | "ok" | "bad";
  deltaInverse?: boolean;
  overridden?: boolean;
  editing?: boolean;
  editValue?: string;
  onEditChange?: (v: string) => void;
  autoPlaceholder?: string;
}) {
  const toneCls = tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : "text-ink";

  // delta 색상: 기본은 delta 양수=ok 음수=bad. inverse 가 true면 반대 (이탈은 +가 나쁨)
  const effectiveDelta = deltaInverse ? -delta : delta;
  const deltaCls =
    effectiveDelta > 0 ? "text-ok" : effectiveDelta < 0 ? "text-bad" : "text-ink-4";
  const DeltaIcon =
    effectiveDelta > 0 ? TrendingUp : effectiveDelta < 0 ? TrendingDown : Minus;

  const isEditable = editing && onEditChange;

  return (
    <div className="p-[18px]">
      <div className="flex items-center gap-1.5 text-[11px] text-ink-4">
        <span className={toneCls}>{icon}</span>
        <span>{label}</span>
        {overridden && !editing && (
          <span className="ml-auto text-[9.5px] font-medium text-warn bg-warn-soft px-1 py-px rounded-[3px] leading-none">
            수동
          </span>
        )}
      </div>
      {isEditable ? (
        <Input
          type="number"
          min={0}
          value={editValue}
          onChange={(e) => onEditChange!(e.target.value)}
          placeholder={autoPlaceholder}
          className="h-9 mt-1 text-lg font-[650] tabular-nums font-mono px-2"
        />
      ) : (
        <p className="text-2xl font-[650] tracking-[-0.03em] tabular-nums font-mono mt-1">
          <span className={toneCls}>{value}</span>
          <span className="text-[12px] text-ink-4 font-normal ml-1">명</span>
        </p>
      )}
      <div className={cn("flex items-center gap-0.5 text-[10.5px] mt-1 tabular-nums", deltaCls)}>
        <DeltaIcon className="h-3 w-3" />
        <span>
          {delta > 0 ? "+" : ""}
          {delta} {deltaLabel}
        </span>
      </div>
    </div>
  );
}
