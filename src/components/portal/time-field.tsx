"use client";

import { useState } from "react";
import { textInput } from "@seed-design/css/recipes/text-input";
import { TimePickerInput } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";

const PORTAL_TIME_INPUT = textInput({ variant: "outline", size: "large" });

/**
 * 학생 포털용 시간 입력 — 공용 TimePickerInput(수정 금지)에 SEED TextField(outline·large) 레시피를 입힌 것.
 * TimePickerInput 은 className 에 레시피 클래스가 있으면 레시피와 겹치는 자체 클래스(border·bg·font·padding)를 빼고 그린다.
 * 포커스 테두리는 레시피의 [data-focus] 규칙을 쓰므로 onFocus/onBlur 로 상태만 붙인다.
 * (SEED TimePicker 는 휠 전용 UI라 트리거·바텀시트·12시간제 변환이 필요해 drop-in 이 아님)
 */
export function PortalTimeField({
  value,
  onChange,
  placeholder,
  disabled = false,
  align = "center",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  align?: "start" | "center";
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      className={cn(PORTAL_TIME_INPUT.root, "bg-bg-layer-default tabular-nums", className)}
      data-focus={focused ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
    >
      <TimePickerInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={cn(
          PORTAL_TIME_INPUT.value,
          "py-0 focus:ring-0 disabled:opacity-100",
          align === "start" ? "text-left" : "text-center"
        )}
      />
    </div>
  );
}
