"use client";

import { useState } from "react";
import { updateAccessDevice, type AccessDeviceView } from "@/actions/access-control";
import type { AccessDeviceStatus } from "@/lib/access-control/types";
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
import { studentOptionLabel, useAccessAction, type StudentOption } from "./shared";

const STATUS_HINT: Record<AccessDeviceStatus, string> = {
  ASSIGNED: "이 학생 대상 규칙과 일시 조치가 이 기기에 적용돼요.",
  EXEMPT: "직원·공용 기기처럼 통제하지 않을 기기예요. 어떤 규칙도 적용되지 않아요.",
  UNASSIGNED: "전체 대상 규칙만 적용돼요.",
};

export function DeviceDialog({
  device,
  students,
  onClose,
}: {
  device: AccessDeviceView;
  students: StudentOption[];
  onClose: () => void;
}) {
  const { pending, run } = useAccessAction();
  // 미배정 기기에서 열었다면 학생에게 배정하려는 경우가 대부분이다
  const [status, setStatus] = useState<AccessDeviceStatus>(device.status === "UNASSIGNED" ? "ASSIGNED" : device.status);
  const [studentId, setStudentId] = useState(device.student?.id ?? "");
  const [label, setLabel] = useState(device.label ?? "");

  // 퇴원 등으로 선택 목록에 없는 학생이 이미 배정돼 있으면 그대로 보이게 넣어 준다
  const current = device.student;
  const options = [
    ...(current && !students.some((s) => s.id === current.id)
      ? [{ value: current.id, label: `${current.name} · ${current.grade}` }]
      : []),
    ...students.map((s) => ({ value: s.id, label: studentOptionLabel(s) })),
  ];

  function submit() {
    run(
      () =>
        updateAccessDevice(device.id, {
          status,
          studentId: status === "ASSIGNED" ? studentId || null : null,
          label,
        }),
      { success: "기기 정보를 저장했어요", onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>기기 배정</DialogTitle>
          <DialogDescription className="break-all">
            {device.hostname ? `${device.hostname} · ` : ""}
            <span className="font-mono">{device.mac}</span>
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-x5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FormField label="상태" hint={STATUS_HINT[status]}>
            <Segmented
              aria-label="기기 상태"
              value={status}
              onChange={setStatus}
              options={[
                { value: "ASSIGNED", label: "학생 기기" },
                { value: "EXEMPT", label: "통제 제외" },
                { value: "UNASSIGNED", label: "미배정" },
              ]}
            />
          </FormField>

          {status === "ASSIGNED" && (
            <FormField label="학생">
              <SearchableSelect
                options={options}
                value={studentId}
                onValueChange={setStudentId}
                placeholder="학생 선택"
                searchPlaceholder="이름으로 찾기"
                emptyText="찾는 학생이 없어요"
              />
            </FormField>
          )}

          <FormField label="이름 (선택)" htmlFor="access-device-label" hint="목록에서 알아보기 쉬운 이름을 붙여 둘 수 있어요.">
            <Input
              id="access-device-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              placeholder={device.hostname ?? "예: 아이패드"}
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
