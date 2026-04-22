"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleHandoverChecklist } from "@/actions/handover";
import { cn } from "@/lib/utils";
import { CheckSquare, Square, User } from "lucide-react";

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
      className={cn(
        "w-full flex items-start gap-2.5 px-4 py-2 text-left text-sm transition-colors",
        isChecked ? "text-green-700 hover:bg-green-50/50" : "text-muted-foreground hover:bg-muted/40"
      )}
    >
      {isChecked ? (
        <CheckSquare className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
      ) : (
        <Square className="h-4 w-4 opacity-30 mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className={cn("font-medium", isChecked && "line-through opacity-80")}>
          {title}
        </p>
        {isChecked && checkedByName && (
          <p className="text-[11px] text-green-600 mt-0.5 flex items-center gap-1">
            <User className="h-3 w-3" />
            {checkedByName}
            {checkedAt && <span className="text-muted-foreground ml-1">· {fmtTime(checkedAt)}</span>}
          </p>
        )}
      </div>
    </button>
  );
}
