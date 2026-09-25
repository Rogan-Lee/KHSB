"use client";

// URL 쿼리(?tab=) 기반 탭 — SEED Tabs (fill 레이아웃). 헤더 바로 아래에 sticky 로 붙는다.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TabsList, TabsRoot, TabsTrigger } from "seed-design/ui/tabs";

export type SegmentOption = {
  key: string;
  label: string;
  count?: number;
};

export function SegmentTabs({
  options,
  param = "tab",
  defaultKey,
}: {
  options: SegmentOption[];
  param?: string;
  defaultKey: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams?.get(param) ?? defaultKey;

  const go = (key: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (key === defaultKey) params.delete(param);
    else params.set(param, key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="sticky top-[calc(env(safe-area-inset-top)+56px)] z-20 -mx-4 mb-x3 bg-[var(--portal-surface,var(--seed-color-bg-layer-basement))]">
      <TabsRoot value={current} onValueChange={go} triggerLayout="fill" size="medium">
        <TabsList>
          {options.map((opt) => (
            <TabsTrigger key={opt.key} value={opt.key}>
              {opt.label}
              {typeof opt.count === "number" && (
                <span className="ml-x1 tabular-nums opacity-70">{opt.count}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </TabsRoot>
    </div>
  );
}
