"use client";

import { useState, useTransition } from "react";
import { getTimetableEntries, getAttendanceAutoBlocks } from "@/actions/timetable";
import { TimetableGrid, TimetableEntry, AutoBlock } from "./timetable-grid";
import { ChevronDown, ChevronUp, Table2 } from "lucide-react";
import { Skeleton } from "@/components/backoffice/ui";

interface Props {
  studentId: string;
  studentName: string;
}

export function TimetableSection({ studentId, studentName }: Props) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<TimetableEntry[] | null>(null);
  const [autoBlocks, setAutoBlocks] = useState<AutoBlock[]>([]);
  const [loading, startTransition] = useTransition();

  function handleOpen() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (entries !== null) return;
    startTransition(async () => {
      const [data, blocks] = await Promise.all([
        getTimetableEntries(studentId),
        getAttendanceAutoBlocks(studentId),
      ]);
      setEntries(data.map((e) => ({ ...e, details: e.details ?? null })));
      setAutoBlocks(blocks);
    });
  }

  return (
    <div className="overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
      <button
        type="button"
        onClick={handleOpen}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-x5 py-x4 text-left transition-colors hover:bg-bg-layer-default-pressed"
      >
        <span className="flex items-center gap-x2 t5-bold text-fg-neutral">
          <Table2 className="size-5 text-fg-neutral-subtle" aria-hidden />
          시간표
        </span>
        {open ? (
          <ChevronUp className="size-5 text-fg-neutral-subtle" aria-hidden />
        ) : (
          <ChevronDown className="size-5 text-fg-neutral-subtle" aria-hidden />
        )}
      </button>

      {open && (
        <div className="border-t border-stroke-neutral-muted p-x4">
          {loading ? (
            <Skeleton className="h-72 w-full" />
          ) : entries !== null ? (
            <TimetableGrid
              studentId={studentId}
              studentName={studentName}
              initialEntries={entries}
              autoBlocks={autoBlocks}
              compact
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
