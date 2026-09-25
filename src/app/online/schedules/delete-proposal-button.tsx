"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteScheduleProposal } from "@/actions/online/schedule-proposals";
import { useConfirm } from "@/components/online/use-confirm";

export function DeleteProposalButton({ id, studentName }: { id: string; studentName?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={studentName ? `${studentName} 제안 삭제` : "삭제"}
        title="삭제"
        disabled={pending}
        onClick={async () => {
          if (
            !(await confirm({
              title: "이 등원 스케줄 제안을 삭제할까요?",
              description: "삭제하면 되돌릴 수 없어요.",
              confirmLabel: "삭제",
              destructive: true,
            }))
          )
            return;
          startTransition(async () => {
            try { await deleteScheduleProposal(id); toast.success("삭제했어요"); router.refresh(); }
            catch (e) { toast.error(e instanceof Error ? e.message : "삭제 실패"); }
          });
        }}
        className="text-fg-neutral-subtle hover:text-fg-critical"
      >
        {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
      {confirmDialog}
    </>
  );
}
