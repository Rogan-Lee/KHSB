"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleHandoverChecklist } from "@/actions/handover";
import { cn } from "@/lib/utils";
import { CheckMark } from "@/components/handover/handover-ui";

interface Props {
  itemId: string;
  title: string;
  isChecked: boolean;
  checkedAt: Date | null;
  checkedByName: string | null;
}

function fmtTime(d: Date) {
  return new Date(d).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChecklistToggleButton({ itemId, title, isChecked: initial, checkedAt: initialAt, checkedByName: initialName }: Props) {
  const [isChecked, setIsChecked] = useState(initial);
  const [checkedAt, setCheckedAt] = useState<Date | null>(initialAt);
  const [checkedByName, setCheckedByName] = useState<string | null>(initialName);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      try {
        await toggleHandoverChecklist(itemId);
        // optimistic local flip
        if (isChecked) {
          setIsChecked(false);
          setCheckedAt(null);
          setCheckedByName(null);
        } else {
          setIsChecked(true);
          setCheckedAt(new Date());
          // 담당자 이름은 서버에서만 알 수 있어 새로고침 전까지 "나"로 표시
          setCheckedByName("나");
        }
      } catch {
        toast.error("처리에 실패했습니다");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      aria-pressed={isChecked}
      className="flex w-full items-start gap-x3 px-x5 py-x3 text-left transition-colors hover:bg-bg-layer-default-pressed disabled:cursor-wait"
    >
      <CheckMark checked={isChecked} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className={cn("t4-medium", isChecked ? "text-fg-neutral-subtle line-through" : "text-fg-neutral")}>
          {title}
        </p>
        {isChecked && checkedByName && (
          <p className="mt-x0_5 t3-regular tabular-nums text-fg-positive">
            {checkedByName}
            {checkedAt && <span className="ml-x1 text-fg-neutral-subtle">· {fmtTime(checkedAt)}</span>}
          </p>
        )}
      </div>
    </button>
  );
}
