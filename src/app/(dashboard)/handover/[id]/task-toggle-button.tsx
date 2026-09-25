"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleHandoverTask } from "@/actions/handover";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/backoffice/ui";
import { CheckMark } from "@/components/handover/handover-ui";

interface TaskToggleButtonProps {
  taskId: string;
  title: string;
  content: string;
  assigneeName: string | null;
  isCompleted: boolean;
}

export function TaskToggleButton({
  taskId,
  title,
  content,
  assigneeName,
  isCompleted: initialCompleted,
}: TaskToggleButtonProps) {
  const [isCompleted, setIsCompleted] = useState(initialCompleted);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      try {
        await toggleHandoverTask(taskId);
        setIsCompleted((prev) => !prev);
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
      aria-pressed={isCompleted}
      className="flex w-full items-start gap-x3 px-x5 py-x3 text-left transition-colors hover:bg-bg-layer-default-pressed disabled:cursor-wait"
    >
      <CheckMark checked={isCompleted} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "t4-medium",
            isCompleted ? "text-fg-neutral-subtle line-through" : "text-fg-neutral"
          )}
        >
          {title}
        </p>
        {content && (
          <p className="mt-x0_5 whitespace-pre-wrap t3-regular text-fg-neutral-muted">{content}</p>
        )}
        {assigneeName && (
          <p className="mt-x1 flex items-center gap-x1_5 t3-regular text-fg-neutral-subtle">
            담당 {assigneeName}
            {isCompleted && <StatusBadge tone="ok">완료</StatusBadge>}
          </p>
        )}
      </div>
    </button>
  );
}
