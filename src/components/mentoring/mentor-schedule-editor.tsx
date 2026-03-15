"use client";

import { useState, useTransition } from "react";
import { saveMentorSchedule, deleteMentorSchedule } from "@/actions/mentoring";
import { saveMentorScheduleForMentor } from "@/actions/mentors";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TimePickerInput } from "@/components/ui/time-picker";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MentorSchedule, User } from "@/generated/prisma";

type ScheduleWithMentor = MentorSchedule & { mentor: Pick<User, "id" | "name"> };

interface Props {
  mentors: { id: string; name: string }[];
  schedules: ScheduleWithMentor[];
  defaultMentorId: string;
  isDirector: boolean;
}

const DAYS = [
  { value: 0, label: "일", weekend: true },
  { value: 1, label: "월", weekend: false },
  { value: 2, label: "화", weekend: false },
  { value: 3, label: "수", weekend: false },
  { value: 4, label: "목", weekend: false },
  { value: 5, label: "금", weekend: false },
  { value: 6, label: "토", weekend: true },
];

export function MentorScheduleEditor({ mentors, schedules, defaultMentorId, isDirector }: Props) {
  const [selectedMentorId, setSelectedMentorId] = useState(defaultMentorId);
  const [editDay, setEditDay] = useState<number | null>(null);
  const [editStart, setEditStart] = useState("14:00");
  const [editEnd, setEditEnd] = useState("18:00");
  const [isPending, startTransition] = useTransition();

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
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  const selectedMentor = mentors.find((m) => m.id === selectedMentorId);

  return (
    <div className="space-y-6">
      {isDirector && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground font-medium">멘토 선택:</span>
          {mentors.map((m) => (
            <button
              key={m.id}
              onClick={() => { setSelectedMentorId(m.id); setEditDay(null); }}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors border",
                m.id === selectedMentorId
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {selectedMentor && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{selectedMentor.name}</span>의 주간 멘토링 가능 시간
        </p>
      )}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/50 border-b text-xs text-muted-foreground">
              <th className="px-4 py-3 text-left w-24 whitespace-nowrap">요일</th>
              <th className="px-4 py-3 text-left">멘토링 가능 시간</th>
              <th className="px-4 py-3 w-28 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {DAYS.map((d) => {
              const sch = scheduleMap.get(d.value);
              const isEditing = editDay === d.value;

              return (
                <tr key={d.value} className={cn("border-b last:border-0", d.weekend ? "bg-muted/20" : "")}>
                  <td className={cn("px-4 py-3 font-medium whitespace-nowrap", d.weekend ? "text-red-500" : "")}>
                    {d.label}요일
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <TimePickerInput value={editStart} onChange={setEditStart} />
                        <span className="text-muted-foreground">~</span>
                        <TimePickerInput value={editEnd} onChange={setEditEnd} />
                        <Button size="sm" className="h-8 text-xs px-3" onClick={handleSave} disabled={isPending}>
                          저장
                        </Button>
                        <button onClick={() => setEditDay(null)} className="text-sm text-muted-foreground hover:text-foreground">
                          취소
                        </button>
                      </div>
                    ) : sch ? (
                      <span className="font-medium text-foreground">{sch.timeStart} ~ {sch.timeEnd}</span>
                    ) : (
                      <span className="text-muted-foreground text-sm">미등록</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isEditing && (
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => startEdit(d.value)}
                          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
                        >
                          {sch ? "수정" : "등록"}
                        </button>
                        {sch && (
                          <button
                            onClick={() => handleDelete(sch.id)}
                            disabled={isPending}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        매주 반복되는 멘토링 가능 시간대입니다. 요일별로 등록하면 매칭 엔진에서 활용됩니다.
      </p>
    </div>
  );
}
