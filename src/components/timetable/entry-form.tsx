"use client";

import { useId, type Dispatch, type SetStateAction } from "react";
import { CalendarDays, Check, Clock, Trash2 } from "lucide-react";
import { Switch } from "seed-design/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
import { COLOR_OPTIONS, normalizeColor, timetableTone } from "./tones";

export type EntryFormState = { subject: string; details: string; colorCode: string; allDay: boolean };

/**
 * 시간표 일정 추가·수정 폼 본문 (주간 그리드 · 일간 보기 공용).
 * 상태와 저장 로직은 부모가 갖고, 여기선 표시만 한다.
 */
export function EntryFormFields({
  mode,
  dayLabel,
  startTime,
  endTime,
  form,
  setForm,
  onSubmit,
  onDelete,
  isPending,
  showResizeHint = false,
  detailsRows = 3,
}: {
  mode: "create" | "edit";
  dayLabel: string;
  startTime: string;
  endTime: string;
  form: EntryFormState;
  setForm: Dispatch<SetStateAction<EntryFormState>>;
  onSubmit: () => void;
  onDelete?: () => void;
  isPending: boolean;
  showResizeHint?: boolean;
  detailsRows?: number;
}) {
  const uid = useId();
  const selectedColor = normalizeColor(form.colorCode);

  return (
    <div className="flex flex-col gap-x4">
      {/* 시간 요약 */}
      <div className="flex flex-col gap-x1 rounded-r2 bg-bg-layer-fill px-x3 py-x2_5">
        <div className="flex items-center gap-x2">
          {form.allDay ? (
            <CalendarDays className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
          ) : (
            <Clock className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
          )}
          <span className="t4-medium tabular-nums text-fg-neutral">
            {dayLabel}
            <span className="text-fg-neutral-subtle"> · </span>
            {form.allDay ? "종일" : `${startTime} – ${endTime}`}
          </span>
        </div>
        {showResizeHint && !form.allDay && (
          <p className="pl-x6 t2-regular text-fg-neutral-subtle">블록 아래 가장자리를 끌면 끝나는 시간을 바꿀 수 있어요</p>
        )}
      </div>

      {/* 종일 */}
      <div className="flex items-center justify-between gap-x3">
        <span className="t4-medium text-fg-neutral">종일 일정</span>
        <Switch
          size="24"
          checked={form.allDay}
          onCheckedChange={(v) => setForm((f) => ({ ...f, allDay: v }))}
          inputProps={{ "aria-label": "종일 일정" }}
        />
      </div>

      <FormField label="과목명" required htmlFor={`${uid}-subject`}>
        <Input
          id={`${uid}-subject`}
          type="text"
          placeholder="수학, 영어, 자습 등"
          value={form.subject}
          onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
          autoFocus
        />
      </FormField>

      <FormField label="메모" htmlFor={`${uid}-details`}>
        <Textarea
          id={`${uid}-details`}
          placeholder="선생님, 교재, 숙제 내용 등"
          value={form.details}
          onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
          rows={detailsRows}
          className="min-h-0 resize-none"
        />
      </FormField>

      <FormField label="색상">
        <div role="radiogroup" aria-label="색상" className="flex flex-wrap gap-x2">
          {COLOR_OPTIONS.map((opt) => {
            const t = timetableTone(opt.key);
            const selected = selectedColor === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={opt.label}
                title={opt.label}
                onClick={() => setForm((f) => ({ ...f, colorCode: opt.key }))}
                className={cn(
                  "grid size-x8 place-items-center rounded-full transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring",
                  t.solid,
                  selected ? "scale-100" : "scale-90 hover:scale-100",
                )}
              >
                {selected && <Check className="size-4 text-palette-static-white" strokeWidth={3} aria-hidden />}
              </button>
            );
          })}
        </div>
      </FormField>

      <div className="flex items-center justify-between gap-x2 border-t border-stroke-neutral-muted pt-x4">
        {mode === "edit" && onDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-fg-critical"
            onClick={onDelete}
            disabled={isPending}
          >
            <Trash2 aria-hidden />
            삭제
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" size="sm" onClick={onSubmit} disabled={isPending}>
          {isPending ? "저장 중…" : mode === "create" ? "추가하기" : "저장하기"}
        </Button>
      </div>
    </div>
  );
}
