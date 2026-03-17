"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CalendarDays } from "lucide-react";
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
    <div className="rounded-xl border border-border/60 bg-white dark:bg-background shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="font-bold text-sm">시간표 / 학습 플랜</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border/40 p-4">
          <DayView
            studentId={studentId}
            entries={entries}
            initialDate={initialDate}
            schoolEvents={schoolEvents}
          />
        </div>
      )}
    </div>
  );
}
