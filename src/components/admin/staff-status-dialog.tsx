"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/backoffice/ui";
import { toast } from "sonner";
import { setUserStatus } from "@/actions/payroll";
import type { UserStatus } from "@/generated/prisma";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    name: string;
    status: UserStatus;
    terminationNote?: string | null;
  };
  onSuccess?: () => void;
}

export function StaffStatusDialog({ open, onOpenChange, user, onSuccess }: Props) {
  const isActive = user.status === "ACTIVE";
  const targetStatus: UserStatus = isActive ? "TERMINATED" : "ACTIVE";
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      try {
        await setUserStatus(user.id, targetStatus, note);
        toast.success(
          isActive ? "퇴사 처리되었습니다" : "활성 상태로 복귀했습니다",
        );
        onOpenChange(false);
        setNote("");
        onSuccess?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "처리에 실패했습니다");
      }
    });
  }

  const effects = isActive
    ? [
        "새 멘토링·근무 선택 목록에서 빠져요.",
        "지난 기록(급여·멘토링·출결)은 그대로 남아요.",
        "발급된 순찰 매직링크는 따로 무효화해야 해요.",
      ]
    : ["선택 목록과 매직링크 발급 대상에 다시 포함돼요."];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="t7-bold">
            {isActive ? "근무자 퇴사 처리" : "근무자 활성 복귀"}
          </DialogTitle>
          <DialogDescription>
            <span className="t4-bold text-fg-neutral">{user.name}</span>
            님을 {isActive ? "퇴사" : "재직"} 상태로 바꿔요.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-x1_5 rounded-r3 bg-bg-layer-fill px-x4 py-x3">
          {effects.map((text) => (
            <li key={text} className="flex gap-x2 t4-regular text-fg-neutral-muted">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-fg-neutral-subtle" />
              {text}
            </li>
          ))}
        </ul>

        {isActive ? (
          <FormField label="사유 메모" htmlFor="termination-note" hint="선택 입력이에요">
            <Textarea
              id="termination-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 2026-05-30 자 퇴사 (계약 만료)"
              rows={3}
            />
          </FormField>
        ) : (
          user.terminationNote && (
            <div className="rounded-r3 border border-stroke-neutral-muted px-x4 py-x3">
              <p className="t3-medium text-fg-neutral-subtle">이전 퇴사 사유</p>
              <p className="mt-x1 t4-regular text-fg-neutral">{user.terminationNote}</p>
            </div>
          )
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            취소
          </Button>
          <Button
            type="button"
            variant={isActive ? "destructive" : "default"}
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending
              ? "처리 중…"
              : isActive
                ? "퇴사 처리"
                : "활성 복귀"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
