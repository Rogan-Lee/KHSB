"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { formatTime } from "@/lib/utils";
import { toast } from "sonner";
import type { AttendanceRecord, AttendanceSchedule, Student } from "@/generated/prisma";
import { Edit2 } from "lucide-react";

type StudentWithAttendance = Student & {
  attendances: AttendanceRecord[];
  schedules: AttendanceSchedule[];
};

const TYPE_CONFIG: Record<string, { label: string; variant: "default" | "destructive" | "secondary" | "outline"; color: string }> = {
  NORMAL: { label: "정상", variant: "default", color: "bg-green-100 border-green-300" },
  ABSENT: { label: "결석", variant: "destructive", color: "bg-red-100 border-red-300" },
  TARDY: { label: "지각", variant: "secondary", color: "bg-orange-100 border-orange-300" },
  EARLY_LEAVE: { label: "정상", variant: "default", color: "bg-green-100 border-green-300" },
  APPROVED_ABSENT: { label: "공결", variant: "secondary", color: "bg-gray-100 border-gray-300" },
  NOTIFIED_ABSENT: { label: "미입실", variant: "secondary", color: "bg-purple-100 border-purple-300" },
};

interface Props {
  students: StudentWithAttendance[];
  today: string;
}

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
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="studentId" value={student.id} />

      <div className="space-y-2">
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>입실 시간</Label>
          <TimePickerInput value={checkIn} onChange={setCheckIn} className="w-full" />
        </div>
        <div className="space-y-2">
          <Label>퇴실 시간</Label>
          <TimePickerInput value={checkOut} onChange={setCheckOut} className="w-full" />
        </div>
      </div>

      <div className="space-y-2">
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
      <Card>
        <CardHeader>
          <CardTitle>
            오늘 출결 현황 ({new Date(today).toLocaleDateString("ko-KR", {
              month: "long",
              day: "numeric",
              weekday: "short",
              timeZone: "Asia/Seoul",
            })})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {students.map((student) => {
              const att = student.attendances[0];
              const hasSchedule = student.schedules.length > 0;
              const config = att
                ? TYPE_CONFIG[att.type]
                : hasSchedule
                ? { label: "미기록", variant: "outline" as const, color: "bg-yellow-50 border-yellow-300" }
                : { label: "비등원일", variant: "outline" as const, color: "bg-gray-50 border-gray-200" };

              return (
                <button
                  key={student.id}
                  onClick={() => setSelected(student)}
                  className={`p-3 rounded-lg border-2 text-left transition-all hover:shadow-md ${config.color}`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-semibold text-sm">{student.name}</span>
                    <Edit2 className="h-3 w-3 text-muted-foreground mt-0.5" />
                  </div>
                  <p className="text-xs text-muted-foreground mb-1.5">{student.grade} {student.seat ? `· ${student.seat}` : ""}</p>
                  <Badge variant={config.variant} className="text-xs">
                    {config.label}
                  </Badge>
                  {att && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {att.checkIn ? formatTime(att.checkIn) : ""}
                      {att.checkIn && att.checkOut ? " → " : ""}
                      {att.checkOut ? formatTime(att.checkOut) : ""}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

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
