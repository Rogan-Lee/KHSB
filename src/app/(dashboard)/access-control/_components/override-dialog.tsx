"use client";

import { useState } from "react";
import { createAccessOverrides, type AccessCatalogItem } from "@/actions/access-control";
import type { AccessAction, AccessScope } from "@/lib/access-control/types";
import { FilterChip, FormField, SearchField, Segmented } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAccessAction, type StudentOption } from "./shared";
import { EMPTY_TARGET, TargetPicker, targetsOf, type TargetValue } from "./target-picker";

const PRESETS = [
  { minutes: 10, label: "10분" },
  { minutes: 30, label: "30분" },
  { minutes: 60, label: "1시간" },
  { minutes: 120, label: "2시간" },
];

/** 지금부터 정한 시간 동안만 허용·차단 — 규칙보다 먼저 적용된다 */
export function OverrideDialog({
  catalog,
  students,
  onClose,
}: {
  catalog: AccessCatalogItem[];
  students: StudentOption[];
  onClose: () => void;
}) {
  const { pending, run } = useAccessAction();
  const [action, setAction] = useState<AccessAction>("ALLOW");
  const [target, setTarget] = useState<TargetValue>(EMPTY_TARGET);
  const [scope, setScope] = useState<AccessScope>("GLOBAL");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [studentQuery, setStudentQuery] = useState("");
  // null 이면 직접 입력
  const [preset, setPreset] = useState<number | null>(30);
  const [customMinutes, setCustomMinutes] = useState("");
  const [reason, setReason] = useState("");

  const query = studentQuery.trim().toLowerCase();
  const shownStudents = query
    ? students.filter((s) => `${s.name} ${s.grade} ${s.seat ?? ""}`.toLowerCase().includes(query))
    : students;

  function toggleStudent(id: string) {
    setStudentIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function submit() {
    run(
      () =>
        createAccessOverrides({
          action,
          targetKind: target.kind,
          targets: targetsOf(target),
          scope,
          studentIds: scope === "STUDENT" ? studentIds : undefined,
          minutes: preset ?? Number(customMinutes),
          reason,
        }),
      { success: (result) => `일시 조치 ${result.created}건을 적용했어요`, onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>일시 조치</DialogTitle>
          <DialogDescription>지금부터 정한 시간 동안만 적용되고, 규칙보다 먼저 적용돼요.</DialogDescription>
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
                { value: "ALLOW", label: "허용" },
                { value: "BLOCK", label: "차단" },
              ]}
            />
          </FormField>

          <TargetPicker catalog={catalog} action={action} value={target} onChange={setTarget} />

          <FormField label="범위" htmlFor={scope === "STUDENT" ? "access-override-student-search" : undefined}>
            <Segmented
              aria-label="범위"
              value={scope}
              onChange={setScope}
              options={[
                { value: "GLOBAL", label: "전체" },
                { value: "STUDENT", label: "학생" },
              ]}
            />
            {scope === "STUDENT" && (
              <>
                <SearchField
                  id="access-override-student-search"
                  className="sm:w-full"
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  onClear={() => setStudentQuery("")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                  placeholder="이름·학년·좌석으로 찾기"
                />
                <ul className="max-h-52 overflow-y-auto rounded-r3 border border-stroke-neutral-muted p-x1_5">
                  {shownStudents.length === 0 && (
                    <li className="py-x6 text-center t4-regular text-fg-neutral-subtle">찾는 학생이 없어요</li>
                  )}
                  {shownStudents.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-x2_5 rounded-r2 px-x2_5 py-x2 transition-colors hover:bg-bg-layer-default-pressed">
                        <Checkbox checked={studentIds.includes(s.id)} onCheckedChange={() => toggleStudent(s.id)} />
                        <span className="min-w-0 flex-1 truncate t4-medium text-fg-neutral">{s.name}</span>
                        <span className="shrink-0 t3-regular text-fg-neutral-subtle">
                          {s.grade}
                          {s.seat ? ` · 좌석 ${s.seat}` : ""}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="t3-regular text-fg-neutral-subtle" aria-live="polite">
                  {studentIds.length > 0 ? (
                    <>
                      <span className="t3-bold tabular-nums text-fg-brand">{studentIds.length}명</span> 골랐어요
                    </>
                  ) : (
                    "한 명 이상 골라 주세요"
                  )}
                </p>
              </>
            )}
          </FormField>

          <FormField
            label="시간"
            htmlFor={preset === null ? "access-override-minutes" : undefined}
            hint="최대 24시간까지예요. 더 길게는 규칙으로 만들어 주세요."
          >
            <div className="flex flex-wrap gap-x1_5" role="group" aria-label="시간">
              {PRESETS.map((p) => (
                <FilterChip key={p.minutes} selected={preset === p.minutes} onClick={() => setPreset(p.minutes)}>
                  {p.label}
                </FilterChip>
              ))}
              <FilterChip selected={preset === null} onClick={() => setPreset(null)}>
                직접 입력
              </FilterChip>
            </div>
            {preset === null && (
              <div className="flex items-center gap-x2">
                <Input
                  id="access-override-minutes"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1440}
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  placeholder="45"
                  className="w-28 tabular-nums"
                />
                <span className="t4-regular text-fg-neutral-subtle">분</span>
              </div>
            )}
          </FormField>

          <FormField label="사유 (선택)" htmlFor="access-override-reason">
            <Input
              id="access-override-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="예: 인강 수강"
            />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              적용
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
