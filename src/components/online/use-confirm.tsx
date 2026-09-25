"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/online/online-confirm-dialog";

export type ConfirmOptions = {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 삭제·덮어쓰기처럼 되돌리기 어려운 동작이면 critical 버튼 */
  destructive?: boolean;
};

/**
 * window.confirm 대체 — 온라인 관리 공용 ConfirmDialog(SEED 규격)를 await 로 쓸 수 있게 감싼다.
 * 기존 `if (!confirm(...)) return;` 흐름을 그대로 유지할 때 쓴다.
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *   if (!(await confirm({ title: "삭제할까요?", destructive: true }))) return;
 *   ...
 *   return <>{...}{confirmDialog}</>;
 */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  // 닫히는 애니메이션 동안 문구가 비지 않도록 마지막 옵션을 유지한다
  const [options, setOptions] = useState<ConfirmOptions>({ title: "" });
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  }, []);

  const dialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) settle(false);
      }}
      title={options.title}
      description={options.description}
      confirmLabel={options.confirmLabel ?? "확인"}
      cancelLabel={options.cancelLabel ?? "취소"}
      destructive={options.destructive}
      onConfirm={() => settle(true)}
    />
  );

  return [confirm, dialog] as const;
}
