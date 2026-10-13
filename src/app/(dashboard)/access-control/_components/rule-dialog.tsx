"use client";

import { useState } from "react";
import { createAccessRules, type AccessCatalogItem } from "@/actions/access-control";
import type { AccessAction, AccessScope } from "@/lib/access-control/types";
import { FormField, Segmented } from "@/components/backoffice/ui";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ALWAYS_SCHEDULE, ScheduleFields, scheduleInputOf, type ScheduleValue } from "./schedule-fields";
import { studentOptionLabel, useAccessAction, type StudentOption } from "./shared";
import { EMPTY_TARGET, TargetPicker, targetsOf, type TargetValue } from "./target-picker";

/** 규칙 추가 — 대상을 여러 개 고르면 대상마다 규칙이 하나씩 생긴다 */
export function RuleDialog({
  catalog,
  students,
  onClose,
}: {
  catalog: AccessCatalogItem[];
  students: StudentOption[];
  onClose: () => void;
}) {
  const { pending, run } = useAccessAction();
  const [action, setAction] = useState<AccessAction>("BLOCK");
  const [target, setTarget] = useState<TargetValue>(EMPTY_TARGET);
  const [scope, setScope] = useState<AccessScope>("GLOBAL");
  const [studentId, setStudentId] = useState("");
  const [schedule, setSchedule] = useState<ScheduleValue>(ALWAYS_SCHEDULE);
  const [note, setNote] = useState("");

  function submit() {
    run(
      () =>
        createAccessRules({
          action,
          targetKind: target.kind,
          targets: targetsOf(target),
          scope,
          studentId: scope === "STUDENT" ? studentId || null : null,
          ...scheduleInputOf(schedule),
          note,
        }),
      { success: (result) => `규칙 ${result.created}개를 추가했어요`, onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>규칙 추가</DialogTitle>
          <DialogDescription>정해 둔 시간마다 계속 적용돼요. 잠깐만 풀거나 막을 때는 일시 조치를 써 주세요.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-x5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FormField label="동작">
            <Segmented
              aria-label="동작"
              value={action}
              onChange={setAction}
              options={[
                { value: "BLOCK", label: "차단" },
                { value: "ALLOW", label: "허용" },
              ]}
            />
          </FormField>

          <TargetPicker catalog={catalog} action={action} value={target} onChange={setTarget} />

          <FormField label="적용 범위">
            <Segmented
              aria-label="적용 범위"
              value={scope}
              onChange={setScope}
              options={[
                { value: "GLOBAL", label: "전체" },
                { value: "STUDENT", label: "학생" },
              ]}
            />
            {scope === "STUDENT" && (
              <SearchableSelect
                options={students.map((s) => ({ value: s.id, label: studentOptionLabel(s) }))}
                value={studentId}
                onValueChange={setStudentId}
                placeholder="학생 선택"
                searchPlaceholder="이름으로 찾기"
                emptyText="찾는 학생이 없어요"
              />
            )}
          </FormField>

          <ScheduleFields value={schedule} onChange={setSchedule} />

          <FormField label="메모 (선택)" htmlFor="access-rule-note">
            <Input
              id="access-rule-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="예: 자습 시간 집중용"
            />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            {/* 학생을 고르기 전에는 막아 둔다 — 서버는 이 경우를 "학생을 찾을 수 없습니다"로 답해 헷갈린다 */}
            <Button type="submit" disabled={pending || (scope === "STUDENT" && !studentId)}>
              추가
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
