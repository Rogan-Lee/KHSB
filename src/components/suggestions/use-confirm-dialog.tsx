"use client";

// window.confirm / window.prompt 대체 — SEED 규격 확인 다이얼로그(ui/dialog 기반).
//   const { confirm, prompt, dialog } = useConfirmDialog();
//   if (!(await confirm({ title: "삭제할까요?", destructive: true }))) return;
//   const reason = await prompt({ title: "취소 사유" }); if (reason === null) return;
//   ...JSX 어딘가에 {dialog} 를 렌더한다.
// 공용화 후보 — 지금은 그룹 D(대기자·상벌점·영단어·질문·건의·신청함) 화면에서만 쓴다.

import { useCallback, useRef, useState, type ReactNode } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/backoffice/ui";

export type ConfirmOptions = {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 삭제·취소처럼 되돌리기 어려운 동작 — 빨간(critical) 버튼 */
  destructive?: boolean;
};

export type PromptOptions = ConfirmOptions & {
  /** 입력 라벨 */
  label?: ReactNode;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  maxLength?: number;
  hint?: ReactNode;
};

type Request = { kind: "confirm"; opts: ConfirmOptions } | { kind: "prompt"; opts: PromptOptions };

export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [req, setReq] = useState<Request | null>(null);
  const [value, setValue] = useState("");
  const resolver = useRef<((v: boolean | string) => void) | null>(null);

  const settle = useCallback((result: boolean | string) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = (v) => resolve(v === true);
        setReq({ kind: "confirm", opts });
        setOpen(true);
      }),
    [],
  );

  const prompt = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        resolver.current?.(false);
        resolver.current = (v) => resolve(typeof v === "string" ? v : null);
        setValue(opts.defaultValue ?? "");
        setReq({ kind: "prompt", opts });
        setOpen(true);
      }),
    [],
  );

  const opts = req?.opts;
  const isPrompt = req?.kind === "prompt";
  const promptOpts = isPrompt ? (req.opts as PromptOptions) : null;

  const dialog = (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) settle(false);
      }}
    >
      {opts && (
        <DialogContent className="max-w-sm [&>button:last-child]:hidden">
          <form
            className="flex flex-col gap-x5"
            onSubmit={(e) => {
              e.preventDefault();
              settle(isPrompt ? value : true);
            }}
          >
            <DialogHeader>
              <DialogTitle className="t7-bold">{opts.title}</DialogTitle>
              {opts.description != null && (
                <DialogDescription className="whitespace-pre-line t5-regular">{opts.description}</DialogDescription>
              )}
            </DialogHeader>

            {promptOpts && (
              <FormField label={promptOpts.label ?? "내용"} hint={promptOpts.hint}>
                {promptOpts.multiline ? (
                  <Textarea
                    autoFocus
                    rows={3}
                    value={value}
                    maxLength={promptOpts.maxLength}
                    placeholder={promptOpts.placeholder}
                    onChange={(e) => setValue(e.target.value)}
                  />
                ) : (
                  <Input
                    autoFocus
                    value={value}
                    maxLength={promptOpts.maxLength}
                    placeholder={promptOpts.placeholder}
                    onChange={(e) => setValue(e.target.value)}
                  />
                )}
              </FormField>
            )}

            <DialogFooter className="grid grid-cols-2 gap-x2 pt-0">
              <Button type="button" variant="secondary" size="lg" onClick={() => settle(false)}>
                {opts.cancelLabel ?? "취소"}
              </Button>
              <Button type="submit" variant={opts.destructive ? "destructive" : "default"} size="lg" autoFocus={!isPrompt}>
                {opts.confirmLabel ?? "확인"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );

  return { confirm, prompt, dialog };
}
