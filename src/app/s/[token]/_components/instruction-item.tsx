"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck } from "lucide-react";
import { ackMyInstruction } from "@/actions/student-instructions";
import type { StudentInstructionView } from "@/lib/student-instructions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/portal/ui";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 선생님 지시 한 건 + [확인했어요]. 카드(Section)는 쓰는 쪽이 감싼다 (홈 카드 · 지시 목록 공용) */
export function InstructionItem({
  token,
  item,
  className,
}: {
  token: string;
  item: StudentInstructionView;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const acked = !!item.ackedAt;

  function ack() {
    startTransition(async () => {
      const res = await ackMyInstruction({ studentToken: token, id: item.id });
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
    });
  }

  return (
    <div className={className}>
      <p
        className={cn(
          "whitespace-pre-wrap break-words",
          acked ? "t5-regular text-fg-neutral-muted" : "t5-bold text-fg-neutral"
        )}
      >
        {item.content}
      </p>
      <p className="mt-x1_5 t3-regular text-fg-neutral-subtle tabular-nums">
        {item.sentByName ?? "담당"} 선생님
        {item.sentAt && ` · ${fmtDate(item.sentAt)}`}
      </p>
      {acked ? (
        <p className="mt-x3 flex items-center gap-x1 t4-medium text-fg-positive tabular-nums">
          <CircleCheck className="size-x4" strokeWidth={2.2} />
          확인함 · {fmtDate(item.ackedAt!)}
        </p>
      ) : (
        <Button variant="primary" size="md" block loading={pending} onClick={ack} className="mt-x4">
          확인했어요
        </Button>
      )}
    </div>
  );
}
