"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { markHandoverRead } from "@/actions/handover";

export function ConfirmButton({ handoverId }: { handoverId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await markHandoverRead(handoverId);
        toast.success("확인되었습니다");
        router.push("/handover");
      } catch {
        toast.error("확인 처리에 실패했습니다");
      }
    });
  }

  return (
    <Button onClick={handleConfirm} disabled={isPending} size="lg">
      <CheckCircle2 className="h-4 w-4" />
      {isPending ? "처리 중..." : "확인"}
    </Button>
  );
}
