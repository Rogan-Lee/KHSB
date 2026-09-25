"use client";

// 공용 확인 다이얼로그(@/components/backoffice/confirm-dialog) — 멘토링용: 기본은 삭제 확인
import {
  ConfirmDialog as BaseConfirmDialog,
  type ConfirmDialogProps,
} from "@/components/backoffice/confirm-dialog";

export function ConfirmDialog({ confirmLabel = "삭제", pendingLabel = "삭제 중…", destructive = true, ...props }: ConfirmDialogProps) {
  return <BaseConfirmDialog confirmLabel={confirmLabel} pendingLabel={pendingLabel} destructive={destructive} {...props} />;
}
