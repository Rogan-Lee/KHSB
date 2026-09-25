"use client";

import { useState, useTransition } from "react";
import { saveMentorSchedule, deleteMentorSchedule } from "@/actions/mentoring";
import { saveMentorScheduleForMentor } from "@/actions/mentors";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TimePickerInput } from "@/components/ui/time-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterChip, Section, StatusBadge, Toolbar } from "@/components/backoffice/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MentorSchedule, User } from "@/generated/prisma";
import { ConfirmDialog } from "./confirm-dialog";

type ScheduleWithMentor = MentorSchedule & { mentor: Pick<User, "id" | "name"> };

interface Props {
  mentors: { id: string; name: string }[];
  schedules: ScheduleWithMentor[];
  defaultMentorId: string;
  isDirector: boolean;
}

// 월요일부터 — 주간 멘토링 계획 화면과 같은 순서
const DAYS = [
  { value: 1, label: "월", weekend: false },
  { value: 2, label: "화", weekend: false },
  { value: 3, label: "수", weekend: false },
  { value: 4, label: "목", weekend: false },
  { value: 5, label: "금", weekend: false },
  { value: 6, label: "토", weekend: true },
  { value: 0, label: "일", weekend: true },
];

export function MentorScheduleEditor({ mentors, schedules, defaultMentorId, isDirector }: Props) {
  const [selectedMentorId, setSelectedMentorId] = useState(defaultMentorId);
  const [editDay, setEditDay] = useState<number | null>(null);
  const [editStart, setEditStart] = useState("14:00");
  const [editEnd, setEditEnd] = useState("18:00");
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const mySchedules = schedules.filter((s) => s.mentorId === selectedMentorId);
  const scheduleMap = new Map(mySchedules.map((s) => [s.dayOfWeek, s]));

  function startEdit(day: number) {
    const existing = scheduleMap.get(day);
    setEditStart(existing?.timeStart ?? "14:00");
    setEditEnd(existing?.timeEnd ?? "18:00");
    setEditDay(day);
  }

  function handleSave() {
    if (editDay === null) return;
    startTransition(async () => {
      try {
        if (isDirector) {
          await saveMentorScheduleForMentor(selectedMentorId, editDay, editStart, editEnd);
        } else {
          await saveMentorSchedule(editDay, editStart, editEnd);
        }
        toast.success("저장되었습니다");
        setEditDay(null);
      } catch {
        toast.error("저장 실패");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteMentorSchedule(id);
        toast.success("삭제되었습니다");
        setDeleteTarget(null);
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  const selectedMentor = mentors.find((m) => m.id === selectedMentorId);

  return (
    <div className="flex flex-col gap-x2">
      {isDirector && (
        <Toolbar>
          <span className="t4-medium text-fg-neutral-muted">멘토</span>
          {mentors.map((m) => (
            <FilterChip
              key={m.id}
              selected={m.id === selectedMentorId}
              onClick={() => { setSelectedMentorId(m.id); setEditDay(null); }}
            >
              {m.name}
            </FilterChip>
          ))}
        </Toolbar>
      )}

      <Section
        title={selectedMentor ? `${selectedMentor.name} 멘토의 멘토링 가능 시간` : "멘토링 가능 시간"}
        description="매주 반복되는 시간대예요. 요일별로 등록하면 매칭 엔진에서 활용돼요."
        count={mySchedules.length}
        flush
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">요일</TableHead>
              <TableHead>멘토링 가능 시간</TableHead>
              <TableHead className="w-40 text-right"><span className="sr-only">작업</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DAYS.map((d) => {
              const sch = scheduleMap.get(d.value);
              const isEditing = editDay === d.value;

              return (
                <TableRow key={d.value} className={cn(isEditing && "bg-bg-layer-fill hover:bg-bg-layer-fill")}>
                  <TableCell className={cn("t4-bold whitespace-nowrap", d.weekend ? "text-fg-critical" : "text-fg-neutral")}>
                    {d.label}요일
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <div className="flex flex-wrap items-center gap-x2">
                        <TimePickerInput value={editStart} onChange={setEditStart} />
                        <span className="text-fg-neutral-subtle">~</span>
                        <TimePickerInput value={editEnd} onChange={setEditEnd} />
                        <Button size="sm" onClick={handleSave} disabled={isPending}>
                          {isPending ? "저장 중…" : "저장"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditDay(null)}>
                          취소
                        </Button>
                      </div>
                    ) : sch ? (
                      <span className="t4-medium tabular-nums text-fg-neutral">{sch.timeStart} ~ {sch.timeEnd}</span>
                    ) : (
                      <StatusBadge tone="gray">미등록</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!isEditing && (
                      <div className="flex items-center justify-end gap-x1">
                        <Button size="xs" variant={sch ? "ghost" : "outline"} onClick={() => startEdit(d.value)}>
                          {sch ? <Pencil /> : <Plus />}
                          {sch ? "수정" : "등록"}
                        </Button>
                        {sch && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-fg-neutral-subtle hover:text-fg-critical"
                            onClick={() => setDeleteTarget({ id: sch.id, label: `${d.label}요일` })}
                            disabled={isPending}
                            aria-label={`${d.label}요일 스케줄 삭제`}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="스케줄 삭제"
        description={deleteTarget ? `${deleteTarget.label} 멘토링 가능 시간을 삭제할까요?` : undefined}
        pending={isPending}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
      />
    </div>
  );
}
