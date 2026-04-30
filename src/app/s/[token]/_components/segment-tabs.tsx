"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

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
  const searchParams = useSearchParams();
  const current = searchParams?.get(param) ?? defaultKey;

  return (
    <div
      role="tablist"
      className="sticky top-12 z-20 -mx-4 mb-3 border-b border-line bg-canvas/85 px-4 py-2 backdrop-blur-md"
    >
      <div className="flex gap-1 rounded-[10px] bg-canvas-2 p-1">
        {options.map((opt) => {
          const isActive = current === opt.key;
          const params = new URLSearchParams(
            searchParams?.toString() ?? ""
          );
          if (opt.key === defaultKey) params.delete(param);
          else params.set(param, opt.key);
          const qs = params.toString();
          const href = qs ? `${pathname}?${qs}` : pathname;
          return (
            <Link
              key={opt.key}
              href={href}
              role="tab"
              aria-selected={isActive}
              scroll={false}
              className={`flex-1 rounded-[8px] py-2 text-center text-[12.5px] font-semibold transition-colors ${
                isActive
                  ? "bg-panel text-ink shadow-xs"
                  : "text-ink-4 active:text-ink-2"
              }`}
            >
              {opt.label}
              {typeof opt.count === "number" && (
                <span
                  className={`ml-1 tabular-nums ${
                    isActive ? "text-brand" : "text-ink-5"
                  }`}
                >
                  {opt.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
