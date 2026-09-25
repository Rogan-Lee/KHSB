"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section, StatusBadge } from "@/components/backoffice/ui";
import { TrendingUp, TrendingDown, Minus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { setEnrollmentAdjustment, type EnrollmentDelta } from "@/actions/dashboard-widgets";

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
    <Section
      title="원생 증감"
      description={`${year}년 ${month}월 기준`}
      actions={
        canEdit && !editing ? (
          <Button variant="ghost" size="xs" onClick={startEdit} title="신규·이탈 수동 조정">
            <Pencil />
            조정
          </Button>
        ) : editing ? (
          <>
            <Button variant="secondary" size="xs" onClick={() => setEditing(false)} disabled={pending}>
              취소
            </Button>
            <Button size="xs" onClick={handleSave} disabled={pending}>
              {pending ? "저장 중…" : "저장"}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="grid grid-cols-3 divide-x divide-stroke-neutral-muted">
        <Cell
          label="현재 재원"
          value={data.total}
          delta={data.deltaVsLastMonth.total}
          deltaLabel="이번 달 순증"
        />
        <Cell
          label="신규 등록"
          value={data.newThisMonth}
          delta={data.deltaVsLastMonth.new}
          deltaLabel="전월비"
          overridden={data.newOverridden}
          editing={editing}
          editValue={newVal}
          onEditChange={setNewVal}
          autoPlaceholder={data.newOverridden ? "자동값" : String(data.newThisMonth)}
        />
        <Cell
          label="이탈"
          value={data.leftThisMonth}
          delta={data.deltaVsLastMonth.left}
          deltaLabel="전월비"
          deltaInverse
          overridden={data.leftOverridden}
          editing={editing}
          editValue={leftVal}
          onEditChange={setLeftVal}
          autoPlaceholder={data.leftOverridden ? "자동값" : String(data.leftThisMonth)}
        />
      </div>
      {editing ? (
        <div className="mt-x4 flex flex-col gap-x2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="조정 사유 (선택)"
            aria-label="조정 사유"
          />
          <p className="t3-regular text-fg-neutral-subtle">
            칸을 비우면 자동 집계(등록·종료일 기준)를 사용해요.
          </p>
        </div>
      ) : (
        <p className="mt-x4 rounded-r2 bg-bg-layer-fill px-x3 py-x2 t3-regular text-fg-neutral-subtle">
          {data.note
            ? `수동 조정: ${data.note}`
            : "현재 재원은 실제 재원(ACTIVE) 기준. 신규·이탈은 해당 월 등록·종료일 기준."}
        </p>
      )}
    </Section>
  );
}

function Cell({
  label,
  value,
  delta,
  deltaLabel,
  deltaInverse,
  overridden,
  editing,
  editValue,
  onEditChange,
  autoPlaceholder,
}: {
  label: string;
  value: number;
  delta: number;
  deltaLabel: string;
  deltaInverse?: boolean;
  overridden?: boolean;
  editing?: boolean;
  editValue?: string;
  onEditChange?: (v: string) => void;
  autoPlaceholder?: string;
}) {
  // delta 색상: 기본은 delta 양수=ok 음수=bad. inverse 가 true면 반대 (이탈은 +가 나쁨)
  const effectiveDelta = deltaInverse ? -delta : delta;
  const deltaCls =
    effectiveDelta > 0 ? "text-fg-positive" : effectiveDelta < 0 ? "text-fg-critical" : "text-fg-neutral-subtle";
  const DeltaIcon =
    effectiveDelta > 0 ? TrendingUp : effectiveDelta < 0 ? TrendingDown : Minus;

  const isEditable = editing && onEditChange;

  return (
    <div className="min-w-0 px-x3 first:pl-0 last:pr-0 sm:px-x4">
      <div className="flex items-center gap-x1_5">
        <span className="truncate t3-medium text-fg-neutral-subtle">{label}</span>
        {overridden && !editing && <StatusBadge tone="warn">수동</StatusBadge>}
      </div>
      {isEditable ? (
        <Input
          type="number"
          min={0}
          value={editValue}
          onChange={(e) => onEditChange!(e.target.value)}
          placeholder={autoPlaceholder}
          aria-label={`${label} 인원`}
          className="mt-x1_5 t6-bold tabular-nums"
        />
      ) : (
        <p className="mt-x1_5 flex items-baseline gap-x0_5">
          <span className="t9-bold tabular-nums text-fg-neutral">{value}</span>
          <span className="t4-regular text-fg-neutral-subtle">명</span>
        </p>
      )}
      <div className={`mt-x1 flex items-center gap-x0_5 t2-regular tabular-nums ${deltaCls}`}>
        <DeltaIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">
          {delta > 0 ? "+" : ""}
          {delta} {deltaLabel}
        </span>
      </div>
    </div>
  );
}
