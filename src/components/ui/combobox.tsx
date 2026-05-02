"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type ComboboxItem = {
  value: string;
  label: string;
  /** 선택지 옆 보조 표시 (예: 학년) */
  subLabel?: string;
  /** 검색 키워드 — 미지정 시 label + subLabel 사용 */
  searchKey?: string;
};

interface ComboboxProps {
  items: ComboboxItem[];
  value: string;
  onChange: (value: string) => void;
  /** 선택 안 됐을 때 trigger 에 표시할 placeholder */
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** form 에 hidden input 으로 값 전송 — name 지정 시 활성화 */
  name?: string;
  required?: boolean;
  /** "선택 없음" 옵션 허용. true 면 emptyLabel 표시 + value="" 선택 가능 */
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
}

export function Combobox({
  items,
  value,
  onChange,
  placeholder = "선택",
  searchPlaceholder = "검색...",
  emptyMessage = "결과 없음",
  name,
  required,
  allowEmpty = false,
  emptyLabel = "선택 안 함",
  disabled,
  className,
  triggerClassName,
  popoverClassName,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.value === value) ?? null;

  return (
    <div className={className}>
      {/* required 검증을 위해 hidden 대신 sr-only 텍스트 인풋 — 브라우저는 type=hidden 의 required 를 무시함 */}
      {name && (
        <input
          type="text"
          name={name}
          value={value}
          required={required && !allowEmpty}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          onChange={() => {}}
          className="sr-only absolute pointer-events-none"
        />
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              !selected && "text-muted-foreground",
              triggerClassName,
            )}
          >
            <span className="truncate text-left">
              {selected
                ? selected.subLabel
                  ? `${selected.label} (${selected.subLabel})`
                  : selected.label
                : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className={cn("w-[260px] p-0", popoverClassName)} align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} className="text-xs" />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {allowEmpty && (
                  <CommandItem
                    value=" "
                    onSelect={() => {
                      onChange("");
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check className={cn("mr-2 h-3.5 w-3.5", value === "" ? "opacity-100" : "opacity-0")} />
                    <span className="text-muted-foreground">{emptyLabel}</span>
                  </CommandItem>
                )}
                {items.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={item.searchKey ?? `${item.label} ${item.subLabel ?? ""}`}
                    onSelect={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3.5 w-3.5",
                        value === item.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {item.label}
                    {item.subLabel && (
                      <span className="ml-1 text-muted-foreground">({item.subLabel})</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
