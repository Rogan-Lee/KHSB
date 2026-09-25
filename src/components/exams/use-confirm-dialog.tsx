"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/backoffice/confirm-dialog";

// 확인 다이얼로그 훅 — window.confirm() 을 SEED 다이얼로그로 바꾼다.
//   const [confirm, confirmDialog] = useConfirmDialog();
//   if (!(await confirm({ title: "삭제할까요?", destructive: true }))) return;
//   …JSX 어딘가에 {confirmDialog}
// 시험·과제·리포트 화면이 함께 쓴다(공용화 후보).

export type ConfirmOptions = {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 삭제·초기화 등 되돌리기 어려운 동작이면 critical 버튼 */
  destructive?: boolean;
};

export function useConfirmDialog(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  }

  const dialog = (
    <ConfirmDialog
      open={options !== null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
      title={options?.title}
      description={options?.description}
      confirmLabel={options?.confirmLabel ?? "확인"}
      cancelLabel={options?.cancelLabel ?? "취소"}
      destructive={options?.destructive}
      autoFocusConfirm
      onConfirm={() => settle(true)}
    />
  );

  return [confirm, dialog];
}
