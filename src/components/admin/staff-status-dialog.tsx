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
import { Badge } from "@/components/ui/badge";
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isActive ? "근무자 퇴사 처리" : "근무자 활성 복귀"}
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-muted-foreground"> 님의 상태를 </span>
            <Badge variant={isActive ? "destructive" : "default"}>
              {isActive ? "퇴사" : "활성"}
            </Badge>
            <span className="text-muted-foreground"> 로 변경합니다.</span>
          </DialogDescription>
        </DialogHeader>

        {isActive ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              · 새 멘토링/근무 픽커에서 제외됩니다.
              <br />
              · 과거 기록(급여·멘토링·출결)은 그대로 유지됩니다.
              <br />
              · 발급된 근무 매직링크가 있다면 별도 무효화가 필요합니다.
            </p>
            <label className="block pt-2">
              <span className="mb-1 block text-xs font-medium">
                사유 메모 (선택)
              </span>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="예: 2026-05-30 자 퇴사 (계약 만료)"
                rows={3}
              />
            </label>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              · 픽커·매직링크 발급에 다시 포함됩니다.
            </p>
            {user.terminationNote && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                이전 사유: {user.terminationNote}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
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
              ? "처리 중..."
              : isActive
                ? "퇴사 처리"
                : "활성 복귀"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
