"use client";

import { useEffect, useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { inputBaseClass } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseTimeText, clampToMinHour } from "@/lib/time-input";

// ponytail: 네이티브 <input type="time">는 ko 로케일에서 "오전/오후" 세그먼트가 붙어
// 고정폭에서 분이 잘리고, 시 입력 시 분 세그먼트로 자동 점프하는 UX 문제가 있어 교체.
// 자유 타이핑("930"→09:30) + 클릭 시 시/분 명시 선택 패널. 항상 24시간 HH:MM 표기.

interface TimePickerInputProps {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  size?: "sm" | "default";
  minHour?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

// ─── 외형 ────────────────────────────────────────────────────────────
// 학생 포털(PortalTimeField)은 SEED TextField 레시피 클래스(seed-text-input__value)를 className 으로 넘겨
// 자체 외형을 입힌다. SEED CSS 가 @layer seed-components 로 들어간 뒤로는 Tailwind 유틸이 레시피를 이기므로,
// 레시피가 정하는 속성(테두리·배경·글꼴·글자 크기·좌우 패딩·placeholder 색)은 여기서 빼 레시피가 그리게 둔다.
// 직원 화면(그 외 전부)은 SEED TextInput(outline) 규격 — ui/input 의 inputBaseClass 를 공유한다.

const PORTAL_INPUT = [
  "rounded tabular-nums text-center",
  "focus:outline-none focus:ring-1 focus:ring-primary transition-colors",
  "disabled:opacity-30 disabled:cursor-not-allowed",
];
const PORTAL_INPUT_SIZE = { sm: "py-1 w-[5.5rem]", default: "py-1.5 w-[6.5rem]" };
const PORTAL_PANEL = {
  column: "flex flex-col w-14 first:border-r",
  label: "text-center text-[10px] text-muted-foreground py-1 border-b shrink-0",
  list: "overflow-y-auto h-44 p-1 space-y-0.5",
  item: "w-full h-6 rounded text-xs font-mono tabular-nums text-center hover:bg-accent",
  itemActive: "bg-primary text-primary-foreground hover:bg-primary",
};

const STAFF_INPUT = cn(inputBaseClass, "border-0 text-center tabular-nums");
const STAFF_INPUT_SIZE = { sm: "h-8 w-[5.5rem] px-x2 t3-regular", default: "h-10 w-[6.5rem] px-x3 t4-regular" };
const STAFF_PANEL = {
  column: "flex w-16 flex-col first:border-r first:border-stroke-neutral-muted",
  label: "shrink-0 border-b border-stroke-neutral-muted py-x1_5 text-center t2-medium text-fg-neutral-subtle",
  list: "flex h-52 flex-col gap-x0_5 overflow-y-auto p-x1",
  item: "h-8 w-full shrink-0 rounded-r2 text-center t4-regular tabular-nums text-fg-neutral transition-colors hover:bg-bg-layer-floating-pressed",
  itemActive: "bg-bg-neutral-inverted t4-bold text-fg-neutral-inverted hover:bg-bg-neutral-inverted",
};

export function TimePickerInput({
  value,
  onChange,
  name,
  disabled = false,
  className,
  placeholder = "--:--",
  size = "default",
  minHour,
  onFocus,
  onBlur,
}: TimePickerInputProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastCommitted = useRef(value);
  const dirty = useRef(false); // 포커스 후 사용자가 실제로 입력/선택했는지

  const portalSkin = !!className?.includes("seed-text-input__value");
  const panel = portalSkin ? PORTAL_PANEL : STAFF_PANEL;

  useEffect(() => {
    lastCommitted.current = value;
    // 편집 중이라도 아직 입력 전이면 외부 value 변경(예: "지금" 버튼)을 그대로 반영
    // (dirty 는 ref 라 렌더 중에 읽을 수 없어 effect 에서 동기화한다 — 기존 동작 유지)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!dirty.current) setText(value);
  }, [value]);

  const shown = editing ? text : value;
  const parsed = parseTimeText(shown);
  const selH = parsed ? Number(parsed.slice(0, 2)) : null;
  const selM = parsed ? Number(parsed.slice(3)) : null;

  // 커밋: blur/Enter/분 클릭 시 1회. 같은 값 재커밋 방지(서버 저장 onChange 중복 호출 차단)
  const commit = (raw: string) => {
    const p = parseTimeText(raw);
    const next = p === null ? lastCommitted.current : clampToMinHour(p, minHour);
    setText(next);
    if (next !== lastCommitted.current) {
      lastCommitted.current = next;
      onChange(next);
    }
  };

  const pickHour = (h: number) => {
    // 시 선택은 초안만 갱신 — 분은 건드리지 않고 패널 유지 (자동 선택/점프 없음)
    dirty.current = true;
    setEditing(true);
    setText(`${pad(h)}:${pad(selM ?? 0)}`);
  };

  const pickMinute = (m: number) => {
    dirty.current = true;
    commit(`${pad(selH ?? 0)}:${pad(m)}`);
    setOpen(false);
  };

  // 패널 열릴 때 현재 선택값을 가운데로
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      contentRef.current
        ?.querySelectorAll('[data-active="true"]')
        .forEach((el) => el.scrollIntoView({ block: "center" }));
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      {name && <input type="hidden" name={name} value={value} />}
      <PopoverAnchor asChild>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          maxLength={5}
          value={shown}
          placeholder={placeholder}
          disabled={disabled}
          onPointerDown={() => setOpen(true)}
          onFocus={() => {
            if (!editing) {
              dirty.current = false;
              setEditing(true);
              setText(value);
            }
            onFocus?.();
          }}
          onChange={(e) => {
            dirty.current = true;
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(text);
              setOpen(false);
            } else if (e.key === "Escape") {
              dirty.current = false;
              setText(value);
              setOpen(false);
            }
          }}
          onBlur={() => {
            commit(text);
            // 세션 종료 후 dedupe 기준을 prop으로 재장전 — 부모가 value를 안 바꾸는
            // 패턴(항상 "" 유지)에서도 다음 입력이 같은 값이면 다시 커밋되도록
            lastCommitted.current = value;
            dirty.current = false;
            setEditing(false);
            setOpen(false);
            onBlur?.();
          }}
          className={
            portalSkin
              ? cn(...PORTAL_INPUT, PORTAL_INPUT_SIZE[size], className)
              : cn(STAFF_INPUT, STAFF_INPUT_SIZE[size], className)
          }
        />
      </PopoverAnchor>
      <PopoverContent
        ref={contentRef}
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        // 패널 조작 중 input blur(=커밋+닫힘) 방지: 포커스는 항상 input에 유지
        onMouseDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (inputRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        className={portalSkin ? "w-auto p-0 flex" : "flex w-auto overflow-hidden p-0"}
      >
        {[
          { key: "hour", label: "시", items: HOURS.filter((h) => !minHour || h >= minHour), sel: selH },
          { key: "minute", label: "분", items: MINUTES, sel: selM },
        ].map((col) => (
          <div key={col.label} className={panel.column}>
            <div className={panel.label}>
              {col.label}
            </div>
            <div className={panel.list}>
              {col.items.map((n) => (
                <button
                  key={n}
                  type="button"
                  tabIndex={-1}
                  data-active={n === col.sel}
                  onClick={() => (col.key === "hour" ? pickHour(n) : pickMinute(n))}
                  className={cn(
                    panel.item,
                    n === col.sel && panel.itemActive
                  )}
                >
                  {pad(n)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// datetime-local 대체용 (날짜 + 시간 분리 입력). name 폼 모드 + value/onChange 제어 모드 지원
interface DateTimePickerInputProps {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export function DateTimePickerInput({ name, defaultValue, value, onChange, className }: DateTimePickerInputProps) {
  const controlled = value !== undefined;
  const initial = controlled ? value : defaultValue;
  const [date, setDate] = useState(initial?.slice(0, 10) ?? "");
  const [time, setTime] = useState(initial?.slice(11, 16) ?? "");

  // 제어 모드: 외부 value 가 바뀌면 날짜·시간 입력을 다시 맞춘다 — 렌더 중 동기화(effect 불필요)
  const [syncedValue, setSyncedValue] = useState(value);
  if (controlled && value !== syncedValue) {
    setSyncedValue(value);
    setDate(value?.slice(0, 10) ?? "");
    setTime(value?.slice(11, 16) ?? "");
  }

  const update = (d: string, t: string) => {
    setDate(d);
    setTime(t);
    onChange?.(d ? (t ? `${d}T${t}` : `${d}T00:00`) : "");
  };

  const combined = date ? (time ? `${date}T${time}` : `${date}T00:00`) : "";

  return (
    <div className={cn("flex gap-x2", className)}>
      {name && <input type="hidden" name={name} value={combined} />}
      <input
        type="date"
        value={date}
        onChange={(e) => update(e.target.value, time)}
        aria-label="날짜"
        className={cn(inputBaseClass, "h-10 min-w-0 flex-1 border-0 tabular-nums")}
      />
      <TimePickerInput value={time} onChange={(t) => update(date, t)} />
    </div>
  );
}
