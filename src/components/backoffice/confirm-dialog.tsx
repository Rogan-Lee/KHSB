"use client";

// 확인 다이얼로그 — window.confirm 대신 쓰는 SEED AlertDialog 규격(제목 t7 bold · 설명 t5 · 버튼 두 개 가로 꽉 참).
// 파괴적 동작은 destructive(또는 tone="critical") → criticalSolid 버튼. pending 동안엔 닫기·버튼이 잠긴다.
// 도메인별 파일(dashboard/, mentoring/, admin/ …)은 기본 문구만 다르게 이 컴포넌트를 감싼다.

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** 결과를 알 수 있는 한두 줄 설명 (p 안에 들어가므로 인라인 요소만) */
  description?: ReactNode;
  /** 설명 아래 추가 내용 (대상 요약 등) */
  children?: ReactNode;
  confirmLabel?: ReactNode;
  pendingLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** 삭제·초기화처럼 되돌리기 어려운 동작 */
  destructive?: boolean;
  /** destructive 의 다른 이름 (critical = destructive) */
  tone?: "brand" | "critical";
  pending?: boolean;
  /** 확인 버튼 자동 포커스 (Enter 로 바로 확인) */
  autoFocusConfirm?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "확인",
  pendingLabel = "처리 중…",
  cancelLabel = "취소",
  destructive,
  tone,
  pending = false,
  autoFocusConfirm = false,
  onConfirm,
}: ConfirmDialogProps) {
  const critical = destructive ?? tone === "critical";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-sm gap-x5 [&>button:last-child]:hidden">
        <DialogHeader className="pr-0">
          <DialogTitle className="t7-bold">{title}</DialogTitle>
          {description != null && (
            <DialogDescription className="whitespace-pre-line t5-regular">{description}</DialogDescription>
          )}
        </DialogHeader>
        {children}
        <DialogFooter className="grid grid-cols-2 gap-x2 pt-0">
          <Button type="button" variant="secondary" size="lg" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={critical ? "destructive" : "default"}
            size="lg"
            onClick={onConfirm}
            disabled={pending}
            autoFocus={autoFocusConfirm}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
