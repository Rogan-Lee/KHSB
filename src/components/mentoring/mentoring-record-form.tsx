"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateMentoring } from "@/actions/mentoring";
import { toast } from "sonner";
import type { Mentoring } from "@/generated/prisma";

interface Props {
  mentoring: Mentoring;
}

export function MentoringRecordForm({ mentoring }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await updateMentoring(mentoring.id, formData);
        toast.success("멘토링 기록이 저장되었습니다");
      } catch {
        toast.error("저장에 실패했습니다");
      }
    });
  }

  const defaultActualDate = mentoring.actualDate
    ? new Date(mentoring.actualDate).toISOString().split("T")[0]
    : "";

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>상태</Label>
          <Select name="status" defaultValue={mentoring.status}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SCHEDULED">예정</SelectItem>
              <SelectItem value="COMPLETED">완료</SelectItem>
              <SelectItem value="CANCELLED">취소</SelectItem>
              <SelectItem value="RESCHEDULED">일정변경</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="actualDate">실제 진행일</Label>
          <Input
            id="actualDate"
            name="actualDate"
            type="date"
            defaultValue={defaultActualDate}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">멘토링 내용 (상담 메모)</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={mentoring.notes || ""}
          placeholder="멘토링에서 나눈 내용을 기록하세요..."
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback">학생 피드백</Label>
        <Textarea
          id="feedback"
          name="feedback"
          defaultValue={mentoring.feedback || ""}
          placeholder="학생의 상태, 발전 사항, 개선 필요한 부분 등..."
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nextGoals">다음 멘토링 목표</Label>
        <Textarea
          id="nextGoals"
          name="nextGoals"
          defaultValue={mentoring.nextGoals || ""}
          placeholder="다음 멘토링까지의 목표와 과제..."
          rows={3}
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "저장 중..." : "저장"}
      </Button>
    </form>
  );
}
