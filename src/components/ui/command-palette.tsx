"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { visibleGroups, visiblePrimary, type NavItem } from "@/components/layout/nav-config";
import { hasFeature, getCurrentPlan } from "@/lib/features";
import { DIGIT_NAV, NAV_SHORTCUTS, useModKey } from "@/lib/nav-shortcuts";

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

const DIGIT_BY_HREF: Record<string, string> = Object.fromEntries(
  NAV_SHORTCUTS.filter((n) => n.digit).map((n) => [n.href, n.digit as string]),
);

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded-r1 bg-bg-neutral-weak px-x1 t2-medium text-fg-neutral-subtle">
      {children}
    </kbd>
  );
}

/**
 * 빠른 이동 (Ctrl/⌘+K). 역할에 보이는 모든 메뉴를 그룹별로 검색한다.
 * 숫자키 1~9 는 어디서든 자주 쓰는 화면으로 바로 이동.
 */
export function CommandPalette({ role }: { role?: string }) {
  const [open, setOpen] = useState(false);
  const mod = useModKey();
  const router = useRouter();
  const plan = getCurrentPlan();

  const sections = useMemo(() => {
    const usable = (it: NavItem) => (it.feature ? hasFeature(plan, it.feature) : true);
    return [
      { label: "자주 쓰는 화면", items: visiblePrimary(role).filter(usable) },
      ...visibleGroups(role).map((g) => ({ label: g.label, items: g.items.filter(usable) })),
    ].filter((s) => s.items.length > 0);
  }, [role, plan]);

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
      <CommandInput placeholder="어디로 이동할까요?" />
      <CommandList className="max-h-[min(420px,60vh)]">
        <CommandEmpty>찾는 메뉴가 없어요</CommandEmpty>
        {sections.map((section) => (
          <CommandGroup key={section.label} heading={section.label}>
            {section.items.map((p) => {
              const Icon = p.icon;
              const digit = DIGIT_BY_HREF[p.href];
              return (
                <CommandItem
                  key={p.href}
                  value={`${section.label} ${p.label}`}
                  onSelect={() => navigate(p.href)}
                >
                  <Icon className="text-fg-neutral-subtle" />
                  <span className="flex-1 truncate">{p.label}</span>
                  {digit && <Kbd>{digit}</Kbd>}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
      <div className="flex items-center gap-x4 border-t border-stroke-neutral-muted px-x4 py-x2_5 t2-regular text-fg-neutral-subtle">
        <span className="flex items-center gap-x1">
          <Kbd>1</Kbd>~<Kbd>9</Kbd> 바로 이동
        </span>
        <span className="flex items-center gap-x1">
          <Kbd>{mod}</Kbd>
          <Kbd>K</Kbd> 검색 열기
        </span>
      </div>
    </CommandDialog>
  );
}
