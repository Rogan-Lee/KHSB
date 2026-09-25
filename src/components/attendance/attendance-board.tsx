"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TimePickerInput } from "@/components/ui/time-picker";
import { upsertAttendance } from "@/actions/attendance";
import { cn, formatTime } from "@/lib/utils";
import { toast } from "sonner";
import type { AttendanceRecord, AttendanceSchedule, Student } from "@/generated/prisma";
import { Pencil, Users } from "lucide-react";
import { EmptyState, Section } from "@/components/backoffice/ui";
import { AttendanceStateBadge, attendanceStateMeta } from "@/components/attendance/attendance-status";

type StudentWithAttendance = Student & {
  attendances: AttendanceRecord[];
  schedules: AttendanceSchedule[];
};

// 기록 유형 → 표시 상태 키(색·라벨은 ./attendance-status 의 단일 매핑을 따른다). 조퇴(EARLY_LEAVE)는 정상으로 본다.
const TYPE_STATE: Record<string, string> = {
  NORMAL: "NORMAL",
  ABSENT: "ABSENT",
  TARDY: "TARDY",
  EARLY_LEAVE: "NORMAL",
  APPROVED_ABSENT: "APPROVED_ABSENT",
  NOTIFIED_ABSENT: "NOTIFIED_ABSENT",
};

interface Props {
  students: StudentWithAttendance[];
  today: string;
}

const TIME_INPUT =
  "h-10 w-full rounded-r2 border-stroke-neutral-weak bg-bg-layer-default px-x3 py-0 t4-medium text-fg-neutral " +
  "focus:border-stroke-neutral-contrast focus:ring-1 focus:ring-stroke-neutral-contrast placeholder:text-fg-placeholder";

function AttendanceEditForm({
  student,
  todayDate,
  onClose,
}: {
  student: StudentWithAttendance;
  todayDate: string;
  onClose: () => void;
}) {
  const attendance = student.attendances[0];
  const [isPending, startTransition] = useTransition();
  const [checkIn, setCheckIn] = useState(
    attendance?.checkIn ? new Date(attendance.checkIn).toTimeString().slice(0, 5) : ""
  );
  const [checkOut, setCheckOut] = useState(
    attendance?.checkOut ? new Date(attendance.checkOut).toTimeString().slice(0, 5) : ""
  );

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        formData.set("date", todayDate);
        formData.set("checkIn", checkIn);
        formData.set("checkOut", checkOut);
        await upsertAttendance(formData);
        toast.success("출결 기록이 저장되었습니다");
        onClose();
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-x4">
      <input type="hidden" name="studentId" value={student.id} />

      <div className="flex flex-col gap-x2">
        <Label>출결 유형</Label>
        <Select name="type" defaultValue={attendance?.type || "NORMAL"}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NORMAL">정상 출석</SelectItem>
            <SelectItem value="ABSENT">결석</SelectItem>
            <SelectItem value="TARDY">지각</SelectItem>
            <SelectItem value="APPROVED_ABSENT">공결</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-x3">
        <div className="flex flex-col gap-x2">
          <Label>입실 시간</Label>
          <TimePickerInput value={checkIn} onChange={setCheckIn} className={TIME_INPUT} />
        </div>
        <div className="flex flex-col gap-x2">
          <Label>퇴실 시간</Label>
          <TimePickerInput value={checkOut} onChange={setCheckOut} className={TIME_INPUT} />
        </div>
      </div>

      <div className="flex flex-col gap-x2">
        <Label htmlFor="notes">비고</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={attendance?.notes || ""}
          placeholder="특이사항을 입력하세요"
          rows={2}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          취소
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "저장 중..." : "저장"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AttendanceBoard({ students, today }: Props) {
  const todayDate = new Date(today).toISOString().split("T")[0];
  const [selected, setSelected] = useState<StudentWithAttendance | null>(null);

  return (
    <>
      <Section
        title={`오늘 출결 현황 (${new Date(today).toLocaleDateString("ko-KR", {
          month: "long",
          day: "numeric",
          weekday: "short",
          timeZone: "Asia/Seoul",
        })})`}
        count={students.length}
      >
        {students.length === 0 ? (
          <EmptyState compact icon={Users} title="표시할 원생이 없어요" />
        ) : (
          <div className="grid grid-cols-2 gap-x3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {students.map((student) => {
              const att = student.attendances[0];
              const hasSchedule = student.schedules.length > 0;
              const state = att ? TYPE_STATE[att.type] ?? "NORMAL" : hasSchedule ? "UNRECORDED" : "NO_SCHEDULE";

              return (
                <button
                  type="button"
                  key={student.id}
                  onClick={() => setSelected(student)}
                  className={cn(
                    "group flex flex-col gap-x1_5 rounded-r3 p-x3 text-left transition-colors",
                    attendanceStateMeta(state).row,
                  )}
                >
                  <div className="flex items-start justify-between gap-x2">
                    <span className="truncate t5-bold text-fg-neutral">{student.name}</span>
                    <Pencil className="mt-x0_5 size-3.5 shrink-0 text-fg-neutral-subtle" aria-hidden />
                  </div>
                  <p className="t3-regular text-fg-neutral-subtle">{student.grade} {student.seat ? `· ${student.seat}` : ""}</p>
                  <AttendanceStateBadge state={state} className="w-fit" />
                  {att && (
                    <p className="t3-regular tabular-nums text-fg-neutral-muted">
                      {att.checkIn ? formatTime(att.checkIn) : ""}
                      {att.checkIn && att.checkOut ? " → " : ""}
                      {att.checkOut ? formatTime(att.checkOut) : ""}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {/* Edit Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.name} 출결 기록</DialogTitle>
          </DialogHeader>
          {selected && (
            <AttendanceEditForm
              key={selected.id}
              student={selected}
              todayDate={todayDate}
              onClose={() => setSelected(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
