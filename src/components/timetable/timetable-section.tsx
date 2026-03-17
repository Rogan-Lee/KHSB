"use client";

import { useState, useTransition } from "react";
import { getTimetableEntries, getAttendanceAutoBlocks } from "@/actions/timetable";
import { TimetableGrid, TimetableEntry, AutoBlock } from "./timetable-grid";
import { ChevronDown, ChevronUp, Table2 } from "lucide-react";

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
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Table2 className="h-4 w-4" />
          시간표
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">불러오는 중...</p>
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
