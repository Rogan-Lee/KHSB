"use client";

import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
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

// SEED SelectTrigger(ui/select) 와 같은 규격 — 높이 40, r2, 1px stroke-neutral-weak, 포커스·열림 2px stroke-neutral-contrast
const TRIGGER =
  "flex h-10 w-full items-center justify-between gap-x2 rounded-r2 border-0 bg-bg-layer-default px-x3 text-left t4-regular text-fg-neutral outline-none transition-shadow " +
  "shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] " +
  "focus-visible:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)] data-[state=open]:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)] " +
  "disabled:cursor-not-allowed disabled:bg-bg-disabled disabled:text-fg-disabled";

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
  const listId = useId();
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
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            disabled={disabled}
            className={cn(TRIGGER, triggerClassName)}
          >
            <span className={cn("truncate", !selected && "text-fg-placeholder")}>
              {selected
                ? selected.subLabel
                  ? `${selected.label} (${selected.subLabel})`
                  : selected.label
                : placeholder}
            </span>
            <ChevronDown className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          id={listId}
          className={cn("w-[260px] min-w-(--radix-popover-trigger-width) overflow-hidden p-0", popoverClassName)}
          align="start"
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} className="h-12 t4-regular" />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup className="p-x1_5">
                {allowEmpty && (
                  <CommandItem
                    // 고유 value — 공백/빈 문자열은 cmdk 가 무시해 선택·호버가 안 됨. 검색어는 keywords 로.
                    value="__empty_option__"
                    keywords={[emptyLabel]}
                    onSelect={() => {
                      onChange("");
                      setOpen(false);
                    }}
                    className="gap-x2"
                  >
                    <Check className={cn("size-4 text-fg-neutral", value === "" ? "opacity-100" : "opacity-0")} />
                    <span className="text-fg-neutral-subtle">{emptyLabel}</span>
                  </CommandItem>
                )}
                {items.map((item) => (
                  <CommandItem
                    key={item.value}
                    // value 는 고유 식별자(=item.value) — 동명이인이어도 cmdk 가 개별 항목으로 인식.
                    // 검색은 keywords(라벨/보조라벨/검색키)로 처리.
                    value={item.value}
                    keywords={[item.label, item.subLabel, item.searchKey].filter((k): k is string => !!k)}
                    onSelect={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    className={cn("gap-x2", value === item.value && "t4-bold")}
                  >
                    <Check
                      className={cn(
                        "size-4 text-fg-neutral",
                        value === item.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 truncate">
                      {item.label}
                      {item.subLabel && (
                        <span className="ml-x1 t4-regular text-fg-neutral-subtle">({item.subLabel})</span>
                      )}
                    </span>
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
