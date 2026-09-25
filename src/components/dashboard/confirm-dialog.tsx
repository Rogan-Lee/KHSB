"use client";

// 공용 확인 다이얼로그(@/components/backoffice/confirm-dialog) — 홈·인수인계·투두용: 기본은 삭제 확인
import {
  ConfirmDialog as BaseConfirmDialog,
  type ConfirmDialogProps,
} from "@/components/backoffice/confirm-dialog";

export function ConfirmDialog({ confirmLabel = "삭제", destructive = true, ...props }: ConfirmDialogProps) {
  return <BaseConfirmDialog confirmLabel={confirmLabel} destructive={destructive} {...props} />;
}
