"use client";

import { useState } from "react";
import { setAccessPause } from "@/actions/access-control";
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
import { useAccessAction } from "./shared";

type Duration = "30" | "60" | "UNTIL_RESUME";

/** 통제 전체 중지 — 규칙·일시 조치는 그대로 두고 적용만 멈춘다 */
export function PauseDialog({ onClose }: { onClose: () => void }) {
  const { pending, run } = useAccessAction();
  const [duration, setDuration] = useState<Duration>("30");

  function submit() {
    run(() => setAccessPause({ paused: true, minutes: duration === "UNTIL_RESUME" ? null : Number(duration) }), {
      success: "통제를 중지했어요",
      onSuccess: onClose,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>전체 중지</DialogTitle>
          <DialogDescription>
            중지한 동안에는 아무것도 막지 않아요. 규칙과 일시 조치는 지워지지 않고, 다시 시작하면 그대로 적용돼요.
          </DialogDescription>
        </DialogHeader>
        <FormField label="중지할 시간">
          <Segmented
            aria-label="중지할 시간"
            value={duration}
            onChange={setDuration}
            options={[
              { value: "30", label: "30분" },
              { value: "60", label: "1시간" },
              { value: "UNTIL_RESUME", label: "다시 켤 때까지" },
            ]}
          />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={submit}>
            중지
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
