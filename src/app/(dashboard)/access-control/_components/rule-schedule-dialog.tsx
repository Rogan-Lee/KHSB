"use client";

import { useState } from "react";
import { updateAccessRuleSchedule, type AccessRuleView } from "@/actions/access-control";
import { FormField } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScheduleFields, scheduleInputOf, type ScheduleValue } from "./schedule-fields";
import { studentText, useAccessAction } from "./shared";

/** 규칙의 요일·시간·메모만 바꾼다 — 대상·범위를 바꾸려면 지우고 새로 만든다 */
export function RuleScheduleDialog({ rule, onClose }: { rule: AccessRuleView; onClose: () => void }) {
  const { pending, run } = useAccessAction();
  const [schedule, setSchedule] = useState<ScheduleValue>({
    mode: rule.daysOfWeek.length > 0 || rule.startTime ? "CUSTOM" : "ALWAYS",
    days: rule.daysOfWeek,
    startTime: rule.startTime ?? "",
    endTime: rule.endTime ?? "",
  });
  const [note, setNote] = useState(rule.note ?? "");

  function submit() {
    run(() => updateAccessRuleSchedule(rule.id, { ...scheduleInputOf(schedule), note }), {
      success: "적용 시간을 바꿨어요",
      onSuccess: onClose,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>시간 변경</DialogTitle>
          <DialogDescription>
            {rule.action === "BLOCK" ? "차단" : "허용"} · {rule.label} ·{" "}
            {rule.student ? studentText(rule.student) : "전체"}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-x5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <ScheduleFields value={schedule} onChange={setSchedule} />

          <FormField label="메모 (선택)" htmlFor="access-rule-edit-note">
            <Input
              id="access-rule-edit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
            />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
