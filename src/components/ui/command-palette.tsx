"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Search } from "lucide-react";
import { NAV_SHORTCUTS, DIGIT_NAV, useModKey } from "@/lib/nav-shortcuts";

/** 입력 요소/IME 조합 중에는 전역 단축키를 무시 */
function isTypingTarget(e: KeyboardEvent): boolean {
  if (e.isComposing) return true;
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const mod = useModKey();
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // 팔레트 토글
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // 팔레트 열림 상태이거나 입력 중이면 전역 단축키 비활성
      if (open || isTypingTarget(e)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // 숫자키 1~9 → 빠른 이동
      if (DIGIT_NAV[e.key]) {
        e.preventDefault();
        router.push(DIGIT_NAV[e.key]);
        return;
      }
      // ? → 단축키 안내(팔레트 열기)
      if (e.key === "?") {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, router]);

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={`빠른 이동 · 숫자키 1~9 · ${mod}+K`} />
      <CommandList>
        <CommandEmpty>검색 결과 없음</CommandEmpty>
        <CommandGroup heading="페이지">
          {NAV_SHORTCUTS.map((p) => {
            const Icon = p.icon;
            return (
              <CommandItem
                key={p.href}
                value={p.label}
                onSelect={() => navigate(p.href)}
                className="gap-2.5"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span>{p.label}</span>
                {p.digit && (
                  <kbd className="ml-auto font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {p.digit}
                  </kbd>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
      <div className="border-t px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-3">
        <span><kbd className="font-mono bg-muted px-1 rounded">1</kbd>~<kbd className="font-mono bg-muted px-1 rounded">9</kbd> 빠른 이동</span>
        <span><kbd className="font-mono bg-muted px-1 rounded">{mod}</kbd>+<kbd className="font-mono bg-muted px-1 rounded">K</kbd> 팔레트</span>
        <span><kbd className="font-mono bg-muted px-1 rounded">?</kbd> 도움말</span>
      </div>
    </CommandDialog>
  );
}

export function CommandTrigger({ className }: { className?: string }) {
  const mod = useModKey();
  return (
    <button
      onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
      className={className}
    >
      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="flex-1 text-left text-xs text-muted-foreground">빠른 이동 · 원생 검색</span>
      <kbd className="font-mono text-[10px] text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded">
        {mod}K
      </kbd>
    </button>
  );
}
