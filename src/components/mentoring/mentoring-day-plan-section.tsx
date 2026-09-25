"use client";

import { useState } from "react";
import { ChevronDown, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { DayView } from "@/components/timetable/day-view";
import { TimetableEntry } from "@/components/timetable/timetable-grid";
import type { SchoolEventInfo } from "@/actions/timetable";

interface Props {
  studentId: string;
  entries: TimetableEntry[];
  initialDate?: string;
  schoolEvents?: SchoolEventInfo[];
}

export function MentoringDayPlanSection({ studentId, entries, initialDate, schoolEvents }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-x3 px-x5 py-x4 text-left transition-colors hover:bg-bg-layer-default-pressed"
      >
        <span className="flex items-center gap-x2 t5-bold text-fg-neutral">
          <CalendarDays className="size-4 text-fg-neutral-subtle" aria-hidden />
          시간표 / 학습 플랜
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-fg-neutral-subtle transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-stroke-neutral-muted p-x5">
          <DayView
            studentId={studentId}
            entries={entries}
            initialDate={initialDate}
            schoolEvents={schoolEvents}
          />
        </div>
      )}
    </section>
  );
}
