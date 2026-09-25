"use client";

// 공용 확인 다이얼로그(@/components/backoffice/confirm-dialog) — 시간표·캘린더·면담용: 기본은 삭제 확인
import {
  ConfirmDialog as BaseConfirmDialog,
  type ConfirmDialogProps,
} from "@/components/backoffice/confirm-dialog";

export function ConfirmDialog({ confirmLabel = "삭제", cancelLabel = "닫기", destructive = true, ...props }: ConfirmDialogProps) {
  return <BaseConfirmDialog confirmLabel={confirmLabel} cancelLabel={cancelLabel} destructive={destructive} {...props} />;
}
