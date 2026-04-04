"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleHandoverTask } from "@/actions/handover";
import { cn } from "@/lib/utils";
import { CheckSquare, Square, User } from "lucide-react";

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
      className={cn(
        "w-full flex items-start gap-2.5 bg-muted/30 hover:bg-muted/50 rounded-lg px-3 py-2 text-left transition-colors",
        isCompleted && "opacity-60"
      )}
    >
      {isCompleted ? (
        <CheckSquare className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
      ) : (
        <Square className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium",
            isCompleted && "line-through text-muted-foreground"
          )}
        >
          {title}
        </p>
        {content && (
          <p className="text-xs text-muted-foreground mt-0.5">{content}</p>
        )}
        {assigneeName && (
          <p className="text-xs text-primary flex items-center gap-0.5 mt-1">
            <User className="h-3 w-3" />
            {assigneeName}
            {isCompleted && (
              <span className="ml-1 text-green-600">완료</span>
            )}
          </p>
        )}
      </div>
    </button>
  );
}
