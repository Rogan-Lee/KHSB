"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteScheduleProposal } from "@/actions/online/schedule-proposals";

export function DeleteProposalButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label="삭제"
      disabled={pending}
      onClick={() => {
        if (!confirm("이 등원 스케줄 제안을 삭제할까요? 되돌릴 수 없습니다.")) return;
        startTransition(async () => {
          try { await deleteScheduleProposal(id); toast.success("삭제했어요"); router.refresh(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "삭제 실패"); }
        });
      }}
      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
